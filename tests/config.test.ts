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
