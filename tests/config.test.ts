import { describe, expect, it } from 'vitest'
import { Config, inject } from '../src'
import { DEFAULT_SCENE_MESSAGE_LIMIT, DEFAULT_SCENE_MESSAGE_MAX_BYTES } from '../src/control-service'

describe('插件持久化配置', () => {
  it('默认使用内存模式，并将 Database 与 ChatLuna Usage 声明为可选服务', () => {
    expect(inject).toEqual({
      required: ['console'],
      optional: ['database', 'chatluna_usage'],
    })
    if (!Config.dict) throw new Error('配置 Schema 缺少字段定义')
    expect(Config.dict.persistenceMode.meta.default).toBe('memory')
    expect(Config.dict.persistenceMode.meta.description).toBe('模拟 QQ 环境状态存储方式')
    expect(Config.dict.sandboxTimBubbleTail.meta.description).toBe('显示气泡小尖角')
    expect(Config.dict.sandboxMarkRecalledMessages.meta.default).toBe(true)
    expect(Config.dict.sandboxMarkRecalledMessages.meta.description).toBe('仅影响 Sandbox 展示：开启时保留撤回气泡并显示撤回线，关闭时只显示撤回事件')
    expect(Config.dict.modelRequestRecordLimit.meta.default).toBe(500)
    expect(Config.dict.modelRequestRecordLimit.meta.description).toBe('每个空间保留的模型请求记录上限')
    expect(Config.dict.webQQChatStyle).toBeUndefined()
  })

  it('场景消息保留上限可配置，且描述说明会丢弃历史消息', () => {
    if (!Config.dict) throw new Error('配置 Schema 缺少字段定义')
    expect(Config.dict.sceneMessageLimit.meta.default).toBe(DEFAULT_SCENE_MESSAGE_LIMIT)
    expect(Config.dict.sceneMessageLimit.meta.description).toContain('丢弃')
    expect(Config.dict.sceneMessageMaxBytes.meta.default).toBe(DEFAULT_SCENE_MESSAGE_MAX_BYTES)
    expect(Config.dict.sceneMessageMaxBytes.meta.description).toContain('丢弃')
  })
})

/**
 * 三个端点分组在插件配置页上的形状与文案分工。
 *
 * 这份守卫钉住的是用户在控制台里看到什么，而不是实现细节：把 `enabled` 或 `path` 从端点分组挪走、
 * 给某个端点改默认值、把「这个端点是干什么的」写回分组标题、或者把端点通用设置的门禁与配额挪回
 * `testEndpoint` 顶层（那样它们会视觉上挂到最后一个端点标题下面），都会让配置页与文档不符，
 * 而这些都不会让别的测试变红。
 */
describe('测试控制端点配置', () => {
  it('两个端点各有独立的总开关与路径，且默认都开启', () => {
    const endpoint = Config.dict?.testEndpoint.dict
    if (!endpoint) throw new Error('测试控制端点配置分组缺失')

    for (const [protocol, path, label] of [['mcp', '/mcp', 'MCP'], ['http', '/api', 'HTTP']] as const) {
      const group = endpoint[protocol].dict
      if (!group) throw new Error(`${protocol} 端点配置分组缺失`)
      expect(group.enabled.meta.default, protocol).toBe(true)
      expect(group.enabled.meta.description, protocol).toBe(`是否开启 ${label}`)
      expect(group.path.meta.default, protocol).toBe(path)
    }
  })

  /**
   * 配置页把分组的 description 渲染成标题（h2），把字段的 description 渲染成字段说明。
   * 标题里塞解释会得到一个折行的长句标题，因此标题只写名字，解释一律落在字段说明里。
   */
  it('分组标题只写名字，解释落在字段说明里', () => {
    const endpoint = Config.dict?.testEndpoint
    if (!endpoint?.dict) throw new Error('测试控制端点配置分组缺失')

    const titles = [endpoint, endpoint.dict.mcp, endpoint.dict.http, endpoint.dict.shared].map(({ meta }) => meta.description)
    expect(titles).toEqual(['测试控制端点', 'MCP 测试端点', 'HTTP 测试端点', '端点通用设置'])
    // 标题里出现标点就意味着它又变成了一句解释；解释归字段说明。
    for (const title of titles) {
      expect(typeof title === 'string' && /[：:；;，,。]/.test(title), String(title)).toBe(false)
    }
  })

  /**
   * 门禁与配额对两个端点同时生效，因此必须自成一组、并排在两个端点分组之后。
   *
   * 顺序是硬要求而不是审美：Koishi 按声明顺序渲染，散字段会挂在上一个 h2 下面。这一组若排在
   * mcp / http 之前，共用字段就会落进「测试控制端点」标题里；若拆散回顶层，就会落进最后一个
   * 端点的标题里，读起来像只对那一个端点生效。
   */
  it('共用的门禁与配额自成一组，且排在两个端点之后', () => {
    const endpoint = Config.dict?.testEndpoint.dict
    if (!endpoint) throw new Error('测试控制端点配置分组缺失')
    const shared = endpoint.shared.dict
    if (!shared) throw new Error('共用配置分组缺失')

    const keys = Object.keys(endpoint)
    expect(keys).toEqual(['host', 'port', 'mcp', 'http', 'shared'])
    expect(keys.indexOf('shared')).toBeGreaterThan(keys.indexOf('http'))
    expect(Object.keys(shared)).toEqual([
      'allowedSources', 'allowedOrigins', 'allowInsecureRemote', 'tlsCertPath', 'tlsKeyPath',
      'readPerMinute', 'mutationPerMinute', 'waitPerMinute', 'uploadPerMinute',
      'maxConcurrentMutations', 'maxConcurrentWaits', 'maxConcurrentUploads',
    ])
    expect(shared.allowedSources.meta.default).toEqual(['127.0.0.1', '::1'])
    expect(shared.allowInsecureRemote.meta.default).toBe(false)
    // 端点分组里只留自己的开关与路径，不得各自再配一份门禁或配额。
    for (const protocol of ['mcp', 'http'] as const) {
      expect(Object.keys(endpoint[protocol].dict ?? {}), protocol).toEqual(['enabled', 'path'])
    }
  })

  it('监听地址与端口留在最外层，端点通用设置', () => {
    const endpoint = Config.dict?.testEndpoint.dict
    if (!endpoint) throw new Error('测试控制端点配置分组缺失')

    expect(endpoint.host.meta.default).toBe('127.0.0.1')
    expect(endpoint.port.meta.default).toBe(61901)
    for (const field of ['host', 'port'] as const) {
      expect(endpoint[field].meta.description, field).toContain('端点通用设置')
    }
  })

  /** 按 KOISHI.md 的配置文案规范：字段说明不以句号结尾，反引号前后不额外加空格。 */
  it('端点字段说明符合配置文案规范', () => {
    const endpoint = Config.dict?.testEndpoint.dict
    if (!endpoint) throw new Error('测试控制端点配置分组缺失')

    const descriptions = [endpoint, endpoint.mcp.dict, endpoint.http.dict, endpoint.shared.dict]
      .flatMap((group) => Object.values(group ?? {}).map((field) => field.meta.description))
      .filter((text): text is string => typeof text === 'string')

    expect(descriptions.length).toBeGreaterThan(15)
    for (const text of descriptions) {
      expect(text, text).not.toMatch(/[。.]$/)
      expect(text, text).not.toMatch(/ `|` /)
    }
  })
})
