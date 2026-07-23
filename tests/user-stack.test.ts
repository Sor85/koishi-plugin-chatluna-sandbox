import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getUserStackLayoutMetrics, getUserStackMetrics, orderUsersByActive } from '../client/user-stack'

describe('发送框用户头像组', () => {
  const users = [
    { id: '10001', name: '测试用户' },
    { id: '10002', name: '协作用户' },
    { id: '10003', name: '管理员' },
    { id: '10004', name: '访客' },
  ]

  it('始终把当前用户排在头像组最右侧对应的首位', () => {
    expect(orderUsersByActive(users, '10003').map(({ id }) => id)).toEqual([
      '10003',
      '10001',
      '10002',
      '10004',
    ])
  })

  it('按原发送框头像尺寸缩放 WebQQ 胶囊的折叠与展开宽度', () => {
    expect(getUserStackMetrics(2)).toEqual({
      collapsedVisibleCount: 2,
      overflowCount: 0,
      collapsedWidth: 57,
      expandedWidth: 63,
    })
    expect(getUserStackMetrics(5)).toEqual({
      collapsedVisibleCount: 3,
      overflowCount: 2,
      collapsedWidth: 99,
      expandedWidth: 144,
    })
  })

  it('始终为末尾添加用户按钮预留头像位置', () => {
    expect(getUserStackLayoutMetrics(0)).toEqual({
      collapsedWidth: 36,
      expandedWidth: 36,
      addCollapsedRight: 0,
      addExpandedRight: 0,
    })
    expect(getUserStackLayoutMetrics(5)).toEqual({
      collapsedWidth: 99,
      expandedWidth: 171,
      addCollapsedRight: 63,
      addExpandedRight: 135,
    })
  })

  it('在发送消息控件中统一创建普通用户和机器人', () => {
    const composerSource = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')
    const popoverSource = readFileSync(resolve('client/environment-create-popover.vue'), 'utf8')

    expect(composerSource).toContain('type="participant"')
    expect(popoverSource).toContain('<SelectItem value="user"')
    expect(popoverSource).toContain('<SelectItem value="bot"')
  })

  it('头像菜单在 Tooltip 内部直接绑定按钮以保留右键坐标', () => {
    const composerSource = readFileSync(resolve('client/webqq-composer.vue'), 'utf8')

    expect(composerSource).toContain('<Tooltip v-for="(sender, index) in orderedSenders"')
    expect(composerSource).toContain('<ContextMenu>\n                      <ContextMenuTrigger as-child>\n                        <button')
    expect(composerSource).not.toContain('<ContextMenu v-for="(sender, index) in orderedSenders"')
    expect(composerSource).toContain('class="webqq-composer-user-menu" style="z-index: 160"')
  })
})
