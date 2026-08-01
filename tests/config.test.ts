import { describe, expect, it } from 'vitest'
import { Config, inject } from '../src'

describe('插件持久化配置', () => {
  it('默认使用内存模式并将 Database 声明为可选服务', () => {
    expect(inject).toEqual({
      required: ['console'],
      optional: ['database'],
    })
    if (!Config.dict) throw new Error('配置 Schema 缺少字段定义')
    expect(Config.dict.persistenceMode.meta.default).toBe('memory')
    expect(Config.dict.persistenceMode.meta.description).toBe('模拟 QQ 环境状态存储方式')
    expect(Config.dict.webQQTimBubbleTail.meta.description).toBe('显示气泡小尖角')
    expect(Config.dict.webQQChatStyle).toBeUndefined()
  })
})
