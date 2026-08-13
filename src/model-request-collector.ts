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
      ...(inferModel(body.value) ? { model: inferModel(body.value) } : {}),
      attribution: resolved.attribution,
      entities: resolved.entities,
      requestBodyAvailable: body.available,
      ...(body.available ? { requestBody: body.value } : {}),
    })

    try {
      const response = await original.call(this, info, init, proxy) as { ok?: boolean, status?: number }
      const durationMs = Date.now() - startedAt
      if (response && typeof response === 'object' && response.ok === false) {
        store.update(pending.id, {
          status: 'error',
          durationMs,
          error: createModelRequestError(new Error(`HTTP ${response.status ?? 'error'}`)),
        })
      } else {
        store.update(pending.id, { status: 'success', durationMs })
      }
      return response
    } catch (error) {
      store.update(pending.id, {
        status: 'error',
        durationMs: Date.now() - startedAt,
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

function inferModel(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return
  const model = Reflect.get(body, 'model')
  return typeof model === 'string' && model ? model : undefined
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
