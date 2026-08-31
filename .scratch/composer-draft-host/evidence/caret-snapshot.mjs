import { writeFileSync } from 'node:fs'
import { open } from './lib.mjs'

/**
 * 发送控件的 DOM 快照与光标快照。
 *
 * 确定性：固定入口、按名字选会话、固定操作序列、固定等待，不复用页面残留状态；
 * 结束时切回另一个会话把草稿清空，因此可以反复运行。全程不发送消息，不改变场景。
 */

const out = process.argv[2] ?? 'snapshot.json'
const ZWSP = '​'

function normalize(html) {
  return html
    .replaceAll(ZWSP, '<zwsp>')
    .replace(/ id="(?:reka|radix)[^"]*"/g, ' id="·"')
    .replace(/aria-(?:controls|labelledby|describedby)="(?:reka|radix)[^"]*"/g, '')
    .replace(/src="(?:blob:|data:)[^"]*"/g, 'src="·"')
    .replace(/\s+/g, ' ')
    .trim()
}

const READ_STATE = () => {
  const ZW = '​'
  const editor = document.querySelector('#chatluna-sandbox-input')
  const root = document.querySelector('.webqq-composer-layout-root')
  const selection = window.getSelection()

  let caret = { kind: 'none' }
  if (editor && selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const container = range.startContainer
    if (!editor.contains(container)) {
      caret = { kind: 'outside' }
    } else {
      const children = Array.from(editor.childNodes)
      const direct = children.indexOf(container)
      const inside = direct >= 0 ? -1 : children.findIndex((child) => child.contains(container))
      caret = {
        kind: container === editor ? 'editor' : 'child',
        childIndex: container === editor ? -1 : (direct >= 0 ? direct : inside),
        insideChild: direct < 0 && container !== editor,
        nodeName: container.nodeName,
        nodeText: (container.textContent || '').replaceAll(ZW, '<zwsp>'),
        offset: range.startOffset,
        collapsed: range.collapsed,
      }
    }
  }

  const menu = document.querySelector('.chatluna-sandbox-composer-mention-menu')
  return {
    caret,
    editorHtml: (editor?.innerHTML ?? '').replaceAll(ZW, '<zwsp>'),
    editorText: (editor?.textContent ?? '').replaceAll(ZW, '<zwsp>'),
    dataEmpty: editor?.getAttribute('data-empty') ?? null,
    placeholderVisible: !!document.querySelector('.webqq-composer-placeholder'),
    sendDisabled: document.querySelector('.webqq-composer-action.is-primary')?.hasAttribute('disabled') ?? null,
    mentionMenu: menu
      ? {
          items: Array.from(menu.querySelectorAll('[role="option"], button, li')).map((node) => node.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
          active: menu.querySelector('.is-active')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
        }
      : null,
    rootWidth: root ? Math.round(root.getBoundingClientRect().width) : null,
    rootHtml: root ? root.outerHTML : null,
  }
}

async function sample(page, label, samples) {
  await page.waitForTimeout(220)
  const state = await page.evaluate(READ_STATE)
  const { rootHtml, ...rest } = state
  samples.push({ label, ...rest, root: normalize(rootHtml ?? '') })
}

async function selectSessionByName(page, name) {
  const items = await page.$$('.webqq-session-list .webqq-session')
  for (const item of items) {
    const text = await item.evaluate((node) => node.textContent.replace(/\s+/g, ' ').trim())
    if (text.startsWith(name)) {
      await item.evaluate((node) => node.click())
      await page.waitForTimeout(1200)
      return true
    }
  }
  throw new Error(`找不到会话：${name}`)
}

/** 派发一次输入法组字与上屏。普通输入接口走不到组字路径。 */
async function composeText(page, value, samples) {
  await page.evaluate((text) => {
    const editor = document.querySelector('#chatluna-sandbox-input')
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    const selection = window.getSelection()
    const range = selection.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) {
      const at = range.startOffset
      node.textContent = node.textContent.slice(0, at) + text + node.textContent.slice(at)
      const next = document.createRange()
      next.setStart(node, at + text.length)
      next.collapse(true)
      selection.removeAllRanges()
      selection.addRange(next)
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: text }))
  }, value)
  await sample(page, `组字中「${value}」`, samples)
  await page.evaluate((text) => {
    const editor = document.querySelector('#chatluna-sandbox-input')
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }))
  }, value)
  await sample(page, `上屏后「${value}」`, samples)
}

const { browser, page } = await open()
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))

const samples = []

// 群会话：提及候选只在群里有。
await selectSessionByName(page, '测试群')
await sample(page, '群会话空态', samples)

const editor = await page.$('#chatluna-sandbox-input')
await editor.click()
await page.waitForTimeout(200)
await sample(page, '点入输入框', samples)

await page.keyboard.type('你好')
await sample(page, '输入两个字符', samples)

await page.keyboard.type(' @')
await sample(page, '输入 @ 打开候选', samples)

await page.keyboard.press('ArrowDown')
await sample(page, '方向键移动候选', samples)

await page.keyboard.press('Enter')
await sample(page, 'Enter 选中候选', samples)

await page.keyboard.press('Backspace')
await sample(page, '退格一次', samples)

await page.keyboard.press('Backspace')
await sample(page, '退格两次', samples)

await page.keyboard.press('ArrowLeft')
await sample(page, '左移一次', samples)
await page.keyboard.press('ArrowLeft')
await sample(page, '左移两次', samples)
await page.keyboard.press('ArrowRight')
await sample(page, '右移一次', samples)

await composeText(page, '中文', samples)

await page.keyboard.press('Escape')
await sample(page, 'Escape', samples)

// 切回私聊：草稿随会话切换清空，页面回到可反复运行的状态。
await selectSessionByName(page, 'Koishi')
await sample(page, '切换会话后清空', samples)

writeFileSync(out, JSON.stringify({ samples, consoleErrors }, null, 2))
console.log('采样点', samples.length, '控制台错误', consoleErrors.length)
await browser.close()
