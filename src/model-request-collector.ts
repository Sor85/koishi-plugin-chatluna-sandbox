import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createModelRequestError, type SandboxModelRequestStore } from './model-request'
import type { SandboxModelRequestAttribution, SandboxModelRequestEntities } from './types'

export interface ChatLunaPluginLike {
  prototype: {
    fetch: (...args: any[]) => Promise<any>
  }
}

export interface ModelRequestThinkingTarget {
  botId: string
  conversationId: string
}

export interface ModelRequestAttributionCandidate {
  scopeId: string
  store: SandboxModelRequestStore
  thinking: ModelRequestThinkingTarget[]
}

const AUTH_QUERY_PATTERN = /^(?:api[_-]?key|key|token|access[_-]?token|auth(?:orization)?|secret|password|signature)$/i
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH'])

export function isKnownChatModelRequestUrl(url: string): boolean {
  const path = readUrlPath(url)
  return /\/chat\/completions\/?$/i.test(path)
    || /\/responses\/?$/i.test(path)
    || /\/v1\/messages\/?$/i.test(path)
    || /:generateContent$/i.test(path)
    || /:streamGenerateContent$/i.test(path)
}

export function sanitizeModelRequestUrl(raw: string): string {
  try {
    const url = new URL(raw)
    // 用户名/密码和认证 query 都属于密钥材料，记录里只保留可复盘的地址本身。
    url.username = ''
    url.password = ''
    for (const key of [...url.searchParams.keys()]) {
      if (AUTH_QUERY_PATTERN.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return raw.split('?')[0] ?? raw
  }
}

export function resolveModelRequestAttribution(candidates: ModelRequestAttributionCandidate[]): {
  attribution: SandboxModelRequestAttribution
  entities: SandboxModelRequestEntities
  store?: SandboxModelRequestStore
} {
  const active = candidates.filter(({ thinking }) => thinking.length > 0)
  // 只能在唯一空间可判定时归属；多个空间同时思考或没有思考态时不猜测。
  if (active.length !== 1) return { attribution: 'unattributed', entities: {} }
  const space = active[0]!
  const botIds = [...new Set(space.thinking.map(({ botId }) => botId))]
  const conversationIds = [...new Set(space.thinking.map(({ conversationId }) => conversationId))]
  return {
    attribution: 'attributed',
    entities: {
      scopeId: space.scopeId,
      ...(botIds.length === 1 ? { botId: botIds[0] } : {}),
      ...(conversationIds.length === 1 ? { conversationId: conversationIds[0] } : {}),
    },
    store: space.store,
  }
}

export function resolveChatLunaPluginClass(baseDir = process.cwd()): ChatLunaPluginLike | undefined {
  const runtimeRequire = createRequire(resolve(baseDir, 'package.json'))
  try {
    // portal 安装时本插件的真实路径不在宿主 node_modules 下；必须从 Koishi baseDir 解析兄弟插件。
    const loaded = runtimeRequire('koishi-plugin-chatluna/services/chat') as { ChatLunaPlugin?: ChatLunaPluginLike }
    if (typeof loaded.ChatLunaPlugin?.prototype?.fetch === 'function') return loaded.ChatLunaPlugin
  } catch {
    // ChatLuna 不是本插件的硬依赖；未安装时跳过包装，沙盒其余功能仍可用。
  }
}

export interface InstallModelRequestCollectorOptions {
  plugin?: ChatLunaPluginLike
  baseDir?: string
  unattributed: SandboxModelRequestStore
  getCandidates: () => ModelRequestAttributionCandidate[]
}

interface CloneableModelResponse {
  ok?: boolean
  status?: number
  bodyUsed?: boolean
  headers?: { get?: (name: string) => string | null }
  clone?: () => { text?: () => Promise<string>, headers?: { get?: (name: string) => string | null } }
}

export function inferModelResponseBodyFormat(contentType: string | undefined, raw: string): 'json' | 'text' | 'sse' {
  if (contentType?.toLowerCase().includes('text/event-stream') || /^(?:event|data|id|retry):/m.test(raw)) return 'sse'
  try {
    JSON.parse(raw)
    return 'json'
  } catch {
    return 'text'
  }
}

export function installModelRequestCollector(options: InstallModelRequestCollectorOptions): () => void {
  const plugin = options.plugin ?? resolveChatLunaPluginClass(options.baseDir)
  if (!plugin) return () => {}
  const original = plugin.prototype.fetch
  if (typeof original !== 'function') return () => {}

  const wrapped = async function wrappedModelRequestFetch(
    this: unknown,
    info: unknown,
    init?: { method?: string, body?: unknown },
    proxy?: unknown,
  ) {
    const request = readRequest(info, init)
    if (!request.url || !MUTATING_METHODS.has(request.method) || !isKnownChatModelRequestUrl(request.url)) {
      return original.call(this, info, init, proxy)
    }

    const body = parseJsonBody(request.body)
    const resolved = resolveModelRequestAttribution(options.getCandidates())
    const store = resolved.attribution === 'attributed' && resolved.store
      ? resolved.store
      : options.unattributed
    const startedAt = Date.now()
    const pending = store.append({
      status: 'pending',
      durationMs: 0,
      method: request.method,
      url: sanitizeModelRequestUrl(request.url),
      ...(inferProvider(request.url) ? { provider: inferProvider(request.url) } : {}),
      ...(inferModel(body.value, request.url) ? { model: inferModel(body.value, request.url) } : {}),
      attribution: resolved.attribution,
      entities: resolved.entities,
      requestBodyAvailable: body.available,
      ...(body.available ? { requestBody: body.value } : {}),
      responseBodyStatus: 'pending',
    })

    try {
      const response = await original.call(this, info, init, proxy) as CloneableModelResponse
      const durationMs = Date.now() - startedAt
      const responseStatus = typeof response?.status === 'number' ? response.status : undefined
      const capture = prepareModelResponseCapture(response)
      if (response && typeof response === 'object' && response.ok === false) {
        store.update(pending.id, {
          status: 'error',
          durationMs,
          responseBodyStatus: capture ? 'pending' : 'unavailable',
          ...(responseStatus !== undefined ? { responseStatus } : {}),
          error: createModelRequestError(new Error(`HTTP ${response.status ?? 'error'}`)),
        })
      } else {
        store.update(pending.id, {
          status: 'success',
          durationMs,
          responseBodyStatus: capture ? 'pending' : 'unavailable',
          ...(responseStatus !== undefined ? { responseStatus } : {}),
        })
      }
      if (capture) {
        // clone 必须在返回给 requester 前同步完成，并立即消费旁路流；否则 requester
        // 锁定原流后无法再 clone，或未消费的 tee 分支持续缓冲并拖慢模型输出。
        store.trackUpdate(capture.then(({ raw, format }) => {
          store.update(pending.id, {
            durationMs: Date.now() - startedAt,
            responseBodyStatus: 'complete',
            responseBodyFormat: format,
            responseBodyRaw: raw,
          })
        }).catch((error) => {
          store.update(pending.id, {
            durationMs: Date.now() - startedAt,
            responseBodyStatus: 'error',
            responseBodyError: error instanceof Error ? error.message : String(error),
          })
        }))
      }
      return response
    } catch (error) {
      store.update(pending.id, {
        status: 'error',
        durationMs: Date.now() - startedAt,
        responseBodyStatus: 'unavailable',
        error: createModelRequestError(error),
      })
      throw error
    }
  }

  plugin.prototype.fetch = wrapped
  return () => {
    if (plugin.prototype.fetch === wrapped) plugin.prototype.fetch = original
  }
}

function prepareModelResponseCapture(
  response: CloneableModelResponse | undefined,
): Promise<{ raw: string, format: 'json' | 'text' | 'sse' }> | undefined {
  if (!response || typeof response.clone !== 'function' || response.bodyUsed) return
  try {
    const clone = response.clone()
    if (typeof clone.text !== 'function') return
    const contentType = clone.headers?.get?.('content-type') ?? response.headers?.get?.('content-type') ?? undefined
    // 这里立即调用 text()，而不是把 clone 留到下一个 tick，确保 tee 的旁路分支
    // 与 ChatLuna 原始分支同时被消费，避免流式响应在未读取分支上无限缓冲。
    return clone.text().then((raw) => ({
      raw,
      format: inferModelResponseBodyFormat(contentType ?? undefined, raw),
    }))
  } catch {
    return
  }
}

function readUrlPath(raw: string): string {
  try {
    return new URL(raw).pathname
  } catch {
    return raw.split('?')[0] ?? raw
  }
}

function readRequest(info: unknown, init?: { method?: string, body?: unknown }) {
  const url = typeof info === 'string'
    ? info
    : info instanceof URL
      ? info.toString()
      : info && typeof info === 'object' && typeof Reflect.get(info, 'url') === 'string'
        ? String(Reflect.get(info, 'url'))
        : ''
  const method = String(
    init?.method
    ?? (info && typeof info === 'object' ? Reflect.get(info, 'method') : undefined)
    ?? 'GET',
  ).toUpperCase()
  // 只读取 init.body 或 Request 上已经是字符串的 body，避免消费流式 Request 导致真实请求失败。
  const body = init?.body ?? (
    info && typeof info === 'object' && typeof Reflect.get(info, 'body') === 'string'
      ? Reflect.get(info, 'body')
      : undefined
  )
  return { url, method, body }
}

function parseJsonBody(body: unknown): { available: boolean, value?: unknown } {
  if (body == null) return { available: false }
  let text: string | undefined
  if (typeof body === 'string') text = body
  else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) text = body.toString('utf8')
  else if (body instanceof Uint8Array) text = Buffer.from(body).toString('utf8')
  else if (body instanceof ArrayBuffer) text = Buffer.from(body).toString('utf8')
  else return { available: false }
  try {
    return { available: true, value: JSON.parse(text) }
  } catch {
    return { available: false }
  }
}

function inferModel(body: unknown, rawUrl?: string): string | undefined {
  if (body && typeof body === 'object') {
    const directModel = Reflect.get(body, 'model')
    if (typeof directModel === 'string' && directModel) return directModel
    const modelVersion = Reflect.get(body, 'modelVersion')
    if (typeof modelVersion === 'string' && modelVersion) return modelVersion
  }
  if (rawUrl) {
    try {
      // Gemini 请求通常没有 body.model；从 /models/<id>:generateContent
      // 回退提取模型，避免详情页把可识别的模型显示为“未识别”。
      const match = new URL(rawUrl).pathname.match(/\/models\/([^/:]+)(?::|$)/i)
      if (match?.[1]) return decodeURIComponent(match[1])
    } catch {
      // 非标准 URL 无法提取模型名时，保留未识别状态。
    }
  }
}

function inferProvider(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('openai')) return 'openai'
    if (host.includes('anthropic')) return 'anthropic'
    if (host.includes('googleapis') || host.includes('generativelanguage')) return 'gemini'
    if (host.includes('openrouter')) return 'openrouter'
    return host || undefined
  } catch {
    return undefined
  }
}
