import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 右侧信息栏', () => {
  it('持有公告与成员界面状态并通过事件提交命令', () => {
    const source = readFileSync(resolve('client/webqq/details-panel.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/workspace/page.vue'), 'utf8')

    expect(source).toContain('model: WebqqDetailsPanelModel')
    expect(source).toContain('persistence: SandboxPersistenceStatus')
    expect(source).toContain('persistenceLabel')
    expect(source).not.toContain('<dd>服务端内存</dd>')
    expect(source).toContain("const announcementInput = ref('')")
    expect(source).toContain("const groupMemberSearch = ref('')")
    expect(source).toContain('publishAnnouncement: [content: string')
    expect(source).toContain('deleteAnnouncement: [announcementId: string')
    expect(source).toContain('personalNote')
    expect(source).toContain('个性签名')
    expect(source).toContain('openProfile')
    expect(source).not.toContain('useMediaQuery')
    expect(pageSource).toContain('<WebqqDetailsPanel')
    expect(pageSource).toContain('openProfile')
    expect(pageSource).not.toContain('class="chatluna-sandbox-group-info-body"')
  })

  it('群成员菜单的「@ 用户」把焦点交给消息输入框', () => {
    const source = readFileSync(resolve('client/webqq/details-panel.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/workspace/page.vue'), 'utf8')
    const chatPaneSource = readFileSync(resolve('client/webqq/chat-pane.vue'), 'utf8')

    /**
     * 让位与否的判定住在 menu-focus-handoff 并由它的行为断言执行；这里钉的是三根线：
     * 「@ 用户」记下交接意图、reka-ui 的还焦事件接到判定上、页面把交接转给聊天区域。详情栏是
     * 聊天区域的兄弟组件，够不到发送控件，因此必须经页面装配走这一趟。少接任何一根，用户接着
     * 打的字都落不进输入框——菜单卸载时焦点被还给右键之前那个元素（成员行不可聚焦，落到 body）。
     */
    expect(source).toContain("menuFocusHandoff.request(member.participantId); emit('mentionGroupMember', member.participantId)")
    expect(source).toContain('@close-auto-focus="handleMemberMenuCloseAutoFocus(member.participantId, $event)"')
    expect(source).toContain('if (!menuFocusHandoff.consume(participantId)) return\n  event.preventDefault()')
    expect(pageSource).toContain('@focus-composer="chatPaneRef?.focusComposer()"')
    expect(chatPaneSource).toContain('defineExpose({ focusComposer })')
  })
})
