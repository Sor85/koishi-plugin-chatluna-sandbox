import { App, Universal } from '@koishijs/core'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../src/control-service'
import {
  installModelRequestCollector,
  isKnownChatModelRequestUrl,
  resolveChatLunaPluginClass,
  sanitizeModelRequestUrl,
} from '../src/model-request-collector'
import { SandboxModelRequestStore } from '../src/model-request'
import { SandboxTestSpaceService } from '../src/test-spaces'

const runningApps: App[] = []
const disposers: Array<() => void> = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) dispose()
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
})

function createFakePlugin(fetchImpl: (...args: unknown[]) => Promise<unknown> = async () => ({ ok: true, status: 200 })) {
  const plugin = {
    lastInit: undefined as { method?: string, body?: unknown, headers?: unknown } | undefined,
    prototype: {
      fetch: fetchImpl,
    },
    async fetch(info: unknown, init?: { method?: string, body?: unknown, headers?: unknown }, proxy?: unknown) {
      plugin.lastInit = init
      return plugin.prototype.fetch.call(plugin, info, init, proxy)
    },
  }
  return plugin
}

function chatBody(model = 'gpt-4o') {
  return JSON.stringify({ model, messages: [{ role: 'user', content: '你好' }] })
}

describe('模型请求采集', () => {
  it('从 Koishi baseDir 解析 portal 安装下的 ChatLuna 运行时', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'chatluna-sandbox-chatluna-'))
    try {
      const packageDir = join(baseDir, 'node_modules/koishi-plugin-chatluna')
      mkdirSync(packageDir, { recursive: true })
      writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
        name: 'koishi-plugin-chatluna',
        exports: { './services/chat': './chat.cjs' },
      }))
      writeFileSync(join(packageDir, 'chat.cjs'), 'exports.ChatLunaPlugin = class ChatLunaPlugin { async fetch() {} }\n')
      expect(resolveChatLunaPluginClass(baseDir)?.prototype.fetch).toBeTypeOf('function')
    } finally {
      rmSync(baseDir, { recursive: true, force: true })
    }
  })

  it('识别已知聊天模型路径并去掉认证 query 与用户信息', () => {
    expect(isKnownChatModelRequestUrl('https://api.openai.com/v1/chat/completions')).toBe(true)
    expect(isKnownChatModelRequestUrl('https://openrouter.ai/api/v1/responses')).toBe(true)
    expect(isKnownChatModelRequestUrl('https://api.anthropic.com/v1/messages')).toBe(true)
    expect(isKnownChatModelRequestUrl('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent')).toBe(true)
    expect(isKnownChatModelRequestUrl('https://api.openai.com/v1/embeddings')).toBe(false)
    expect(sanitizeModelRequestUrl('https://user:pass@api.openai.com/v1/chat/completions?api_key=secret&n=1')).toBe(
      'https://api.openai.com/v1/chat/completions?n=1',
    )
  })

  it('从 Gemini generateContent URL 提取请求模型 ID', async () => {
    const unattributed = new SandboxModelRequestStore()
    const plugin = createFakePlugin(async () => new Response(JSON.stringify({
      candidates: [],
      usageMetadata: { promptTokenCount: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    disposers.push(installModelRequestCollector({
      plugin,
      unattributed,
      getCandidates: () => [],
    }))

    await plugin.fetch('http://192.168.5.3/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST',
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: '你好' }] }] }),
    })
    await unattributed.waitForPersistence()

    expect(unattributed.getRecords().records[0]).toMatchObject({ model: 'gemini-3.6-flash' })
  })
  it('包装公共 fetch：记录 JSON 请求体、不存 headers，并在完成后从 pending 变为 success/error', async () => {
    const unattributed = new SandboxModelRequestStore()
    let status: 'ok' | 'http' | 'throw' = 'ok'
    const plugin = createFakePlugin(async () => {
      if (status === 'throw') throw new Error('upstream timeout')
      if (status === 'http') {
        return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '你好' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    disposers.push(installModelRequestCollector({
      plugin,
      unattributed,
      getCandidates: () => [],
    }))

    const originalResponse = await plugin.fetch('https://api.openai.com/v1/chat/completions?api_key=secret', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: chatBody(),
    }) as Response
    await unattributed.waitForPersistence()
    const [success] = unattributed.getRecords().records
    expect(success).toMatchObject({
      status: 'success',
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      provider: 'openai',
      model: 'gpt-4o',
      attribution: 'unattributed',
      requestBodyAvailable: true,
      responseStatus: 200,
      responseBodyStatus: 'complete',
      responseBodyFormat: 'json',
    })
    expect(success).not.toHaveProperty('headers')
    expect(JSON.stringify(success)).not.toContain('secret')
    expect(JSON.stringify(success)).not.toContain('Bearer')
    expect(unattributed.getRecord(success!.id)).toMatchObject({
      requestBody: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: '你好' }],
      },
      responseBodyRaw: JSON.stringify({ choices: [{ message: { content: '你好' } }] }),
    })
    await expect(originalResponse.json()).resolves.toEqual({ choices: [{ message: { content: '你好' } }] })
    expect(plugin.lastInit).toMatchObject({ headers: { authorization: 'Bearer secret' } })

    status = 'throw'
    await expect(plugin.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: chatBody('gpt-4.1'),
    })).rejects.toThrow('upstream timeout')
    expect(unattributed.getRecords({ errorsOnly: true }).records[0]).toMatchObject({
      status: 'error',
      model: 'gpt-4.1',
      error: { retryable: true, message: 'upstream timeout' },
    })

    status = 'http'
    await plugin.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: chatBody('gpt-5') })
    await unattributed.waitForPersistence()
    expect(unattributed.getRecords({ model: 'gpt-5' }).records[0]).toMatchObject({
      status: 'error',
      responseStatus: 429,
      responseBodyStatus: 'complete',
      responseBodyFormat: 'json',
      error: { message: 'HTTP 429' },
    })
  })

  it('旁路采集流式 SSE，且不会等待完整响应后才把原始流交给 ChatLuna', async () => {
    const unattributed = new SandboxModelRequestStore()
    const encoder = new TextEncoder()
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    const response = new Response(new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
        value.enqueue(encoder.encode('data: {"delta":"你"}\n\n'))
      },
    }), {
      headers: { 'content-type': 'text/event-stream' },
    })
    const plugin = createFakePlugin(async () => response)
    disposers.push(installModelRequestCollector({
      plugin,
      unattributed,
      getCandidates: () => [],
    }))

    const originalResponse = await plugin.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: chatBody('stream-model'),
    }) as Response
    expect(unattributed.getRecords().records[0]).toMatchObject({
      status: 'success',
      responseBodyStatus: 'pending',
    })

    controller?.enqueue(encoder.encode('data: {"delta":"好"}\n\ndata: [DONE]\n\n'))
    controller?.close()
    await unattributed.waitForPersistence()
    expect(unattributed.getRecord(unattributed.getRecords().records[0]!.id)).toMatchObject({
      responseBodyStatus: 'complete',
      responseBodyFormat: 'sse',
      responseBodyRaw: 'data: {"delta":"你"}\n\ndata: {"delta":"好"}\n\ndata: [DONE]\n\n',
    })
    await expect(originalResponse.text()).resolves.toContain('data: {"delta":"你"}')
  })

  it('忽略未知路径，并在销毁后恢复原始 fetch', async () => {
    const unattributed = new SandboxModelRequestStore()
    const plugin = createFakePlugin()
    const original = plugin.prototype.fetch
    const dispose = installModelRequestCollector({
      plugin,
      unattributed,
      getCandidates: () => [],
    })
    disposers.push(dispose)
    await plugin.fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      body: JSON.stringify({ model: 'text-embedding-3-small', input: 'hi' }),
    })
    expect(unattributed.getRecords().records).toEqual([])
    dispose()
    expect(plugin.prototype.fetch).toBe(original)
  })

  it('仅在唯一思考空间时归属，无法唯一判定则进入未归属库', async () => {
    const app = new App()
    runningApps.push(app)
    const runtimeBots = new SandboxRuntimeBotRegistry()
    const main = new SandboxControlService(app, { runtimeBots })
    const spaces = new SandboxTestSpaceService(app, runtimeBots)
    const space = spaces.createSpace({ name: '归属空间' })
    space.control.createUser({ id: '11001', name: '测试用户' })
    space.control.createBot({ id: '21001', name: '空间机器人', implementation: 'napcat', enabled: true })
    await app.start()

    const unattributed = new SandboxModelRequestStore()
    const plugin = createFakePlugin(async () => ({ ok: true, status: 200 }))
    disposers.push(installModelRequestCollector({
      plugin,
      unattributed,
      getCandidates: () => [
        { scopeId: 'main', store: main.getModelRequestStore(), thinking: main.getThinkingModelRequestTargets() },
        { scopeId: space.id, store: space.control.getModelRequestStore(), thinking: space.control.getThinkingModelRequestTargets() },
      ],
    }))

    await plugin.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: chatBody('none') })
    expect(unattributed.getRecords().records[0]).toMatchObject({ attribution: 'unattributed', model: 'none' })
    expect(space.control.getModelRequestRecords().records).toEqual([])

    const session = space.control.getRuntimeBot('21001').session({
      type: 'message',
      user: { id: '11001', name: '测试用户' },
      channel: { id: 'private:11001:21001', type: Universal.Channel.Type.DIRECT },
    })
    await (app.parallel as unknown as (event: string, ...args: unknown[]) => Promise<void>)(
      'chatluna/before-chat',
      'chatluna:space',
      {},
      {},
      {},
      session,
    )
    await plugin.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: chatBody('attributed') })
    expect(space.control.getModelRequestRecords().records[0]).toMatchObject({
      attribution: 'attributed',
      model: 'attributed',
      entities: { scopeId: space.id, botId: '21001', conversationId: 'private:11001:21001' },
    })

    const mainSession = main.getRuntimeBot('20001').session({
      type: 'message',
      user: { id: '10001', name: '测试用户1' },
      channel: { id: 'private:10001:20001', type: Universal.Channel.Type.DIRECT },
    })
    await (app.parallel as unknown as (event: string, ...args: unknown[]) => Promise<void>)(
      'chatluna/before-chat',
      'chatluna:main',
      {},
      {},
      {},
      mainSession,
    )
    await plugin.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', body: chatBody('ambiguous') })
    expect(unattributed.getRecords({ model: 'ambiguous' }).records[0]).toMatchObject({
      attribution: 'unattributed',
      entities: {},
    })
    expect(main.getModelRequestRecords().records).toEqual([])
  })
})
