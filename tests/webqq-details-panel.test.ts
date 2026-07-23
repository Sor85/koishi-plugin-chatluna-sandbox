import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('WebQQ 右侧信息栏', () => {
  it('持有公告与成员界面状态并通过事件提交命令', () => {
    const source = readFileSync(resolve('client/webqq-details-panel.vue'), 'utf8')
    const pageSource = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(source).toContain('model: WebqqDetailsPanelModel')
    expect(source).toContain("const announcementInput = ref('')")
    expect(source).toContain("const groupMemberSearch = ref('')")
    expect(source).toContain('publishAnnouncement: [content: string')
    expect(source).toContain('deleteAnnouncement: [announcementId: string')
    expect(source).not.toContain('useMediaQuery')
    expect(pageSource).toContain('<WebqqDetailsPanel')
    expect(pageSource).not.toContain('class="webqq-group-info-body"')
  })
})
