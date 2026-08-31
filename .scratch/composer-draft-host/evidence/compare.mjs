import { readFileSync } from 'node:fs'

const [beforePath, afterPath] = process.argv.slice(2)
const before = JSON.parse(readFileSync(beforePath, 'utf8'))
const after = JSON.parse(readFileSync(afterPath, 'utf8'))
const diff = []

if (before.samples.length !== after.samples.length) {
  diff.push(`采样点数不同：${before.samples.length} vs ${after.samples.length}`)
}

before.samples.forEach((a, index) => {
  const b = after.samples[index]
  if (!b) return
  if (a.label !== b.label) {
    diff.push(`采样点 ${index} 标签不同：${a.label} vs ${b.label}`)
    return
  }
  for (const key of ['editorHtml', 'editorText', 'dataEmpty', 'placeholderVisible', 'sendDisabled', 'rootWidth']) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      diff.push(`${a.label} · ${key}：${JSON.stringify(a[key])} vs ${JSON.stringify(b[key])}`)
    }
  }
  if (JSON.stringify(a.caret) !== JSON.stringify(b.caret)) {
    diff.push(`${a.label} · 光标：${JSON.stringify(a.caret)} vs ${JSON.stringify(b.caret)}`)
  }
  if (JSON.stringify(a.mentionMenu) !== JSON.stringify(b.mentionMenu)) {
    diff.push(`${a.label} · 候选菜单：${JSON.stringify(a.mentionMenu)} vs ${JSON.stringify(b.mentionMenu)}`)
  }
  if (a.root !== b.root) {
    let at = 0
    while (at < a.root.length && a.root[at] === b.root[at]) at += 1
    diff.push(`${a.label} · DOM 首处差异 @${at}\n  基线: ${a.root.slice(Math.max(0, at - 100), at + 100)}\n  当前: ${b.root.slice(Math.max(0, at - 100), at + 100)}`)
  }
})

if (before.consoleErrors.length || after.consoleErrors.length) {
  diff.push(`控制台错误：基线 ${JSON.stringify(before.consoleErrors)} 当前 ${JSON.stringify(after.consoleErrors)}`)
}

console.log(diff.length ? diff.join('\n') : 'DOM 快照与光标快照与基线逐字一致')
