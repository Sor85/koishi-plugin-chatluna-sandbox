import { readFileSync } from 'node:fs'

const [beforePath, afterPath] = process.argv.slice(2)
const before = JSON.parse(readFileSync(beforePath, 'utf8'))
const after = JSON.parse(readFileSync(afterPath, 'utf8'))
const diff = []

if (before.samples.length !== after.samples.length) {
  diff.push(`采样点数不同：${before.samples.length} vs ${after.samples.length}`)
}

before.samples.forEach((baseline, index) => {
  const current = after.samples[index]
  if (!current) return
  if (baseline.label !== current.label) {
    diff.push(`采样点 ${index} 标签不同：${baseline.label} vs ${current.label}`)
    return
  }
  for (const key of ['spinners', 'errorTexts']) {
    if (JSON.stringify(baseline[key]) !== JSON.stringify(current[key])) {
      diff.push(`${baseline.label} · ${key}：${JSON.stringify(baseline[key])} vs ${JSON.stringify(current[key])}`)
    }
  }
  if (baseline.dom !== current.dom) {
    let at = 0
    while (at < baseline.dom.length && baseline.dom[at] === current.dom[at]) at += 1
    diff.push(`${baseline.label} · DOM 首处差异 @${at}\n  基线: ${baseline.dom.slice(Math.max(0, at - 120), at + 120)}\n  当前: ${current.dom.slice(Math.max(0, at - 120), at + 120)}`)
  }
})

if (before.consoleErrors.length || after.consoleErrors.length) {
  diff.push(`控制台错误：基线 ${JSON.stringify(before.consoleErrors)} 当前 ${JSON.stringify(after.consoleErrors)}`)
}

console.log(diff.length ? diff.join('\n') : `${before.samples.length} 个采样点的 DOM 与基线逐字一致，控制台无错误`)
