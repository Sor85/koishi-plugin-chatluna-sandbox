import { readFileSync } from 'node:fs'

/** 逐采样点比对两份 DOM 快照：DOM 哈希、滚动量与各项可读计数。 */
const [baselinePath, currentPath] = process.argv.slice(2)
if (!baselinePath || !currentPath) throw new Error('用法：node compare-dom.mjs <基线 json> <当前 json>')

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const current = JSON.parse(readFileSync(currentPath, 'utf8'))
const keys = [
  'length', 'sha256', 'scrollTop', 'collapsedMessageCards', 'collapsedVariableCards',
  'expandedTools', 'collapsedNavGroups', 'mountedRawBlocks', 'hiddenRawBlocks',
  'historyPreviews', 'currentNavTarget', 'cardHeaderLabels', 'navExpanded',
]

let differences = 0
if (baseline.samples.length !== current.samples.length) {
  console.log(`采样点数量不同：${baseline.samples.length} → ${current.samples.length}`)
  differences += 1
}
for (const [index, before] of baseline.samples.entries()) {
  const after = current.samples[index]
  if (!after) continue
  if (before.label !== after.label) {
    console.log(`#${index} 采样点标签不同：${before.label} → ${after.label}`)
    differences += 1
  }
  for (const key of keys) {
    const left = JSON.stringify(before[key])
    const right = JSON.stringify(after[key])
    if (left === right) continue
    console.log(`${before.label} · ${key}：${left} → ${right}`)
    differences += 1
  }
}
console.log(`控制台错误：基线 ${baseline.consoleErrors.length} 条，当前 ${current.consoleErrors.length} 条`)
for (const error of current.consoleErrors) console.log(`  当前：${error}`)
console.log(differences ? `共 ${differences} 处差异` : `${baseline.samples.length} 个采样点全部一致（${baseline.engine} / ${current.engine}）`)
