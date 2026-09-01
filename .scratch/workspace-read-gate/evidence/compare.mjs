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
  for (const region of ['debug', 'mcpCall', 'modelRequest', 'preset', 'composer']) {
    const left = JSON.stringify(baseline.models[region])
    const right = JSON.stringify(current.models[region])
    if (left === right) continue
    let at = 0
    while (at < left.length && left[at] === right[at]) at += 1
    diff.push(`${baseline.label} · ${region} 首处差异 @${at}\n  基线: ${left.slice(Math.max(0, at - 80), at + 80)}\n  当前: ${right.slice(Math.max(0, at - 80), at + 80)}`)
  }
})

console.log(diff.length ? diff.join('\n') : `${before.samples.length} 个采样点上五个模型的完整输出与基线逐字节相同`)
