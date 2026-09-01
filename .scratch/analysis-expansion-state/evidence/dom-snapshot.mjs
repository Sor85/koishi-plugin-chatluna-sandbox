import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium, firefox } from 'playwright'

/**
 * 分析视图的 DOM 快照，十个采样点。
 *
 * 这一轮的可观察结果是渲染而不是模型：分析视图是组件，没有可导出的模型，它的对外事实就是
 * 折叠、展开、原文与复位在 DOM 上的形态。采样点逐一对应票 01 与票 02 的验收条目。
 *
 * 确定性靠三件事：
 * - 每次全新浏览器上下文（本地偏好为空，首屏视图与筛选固定），只读不写，不触发新的模型请求。
 * - 一律用 `element.click()` 直接派发，不用 Playwright 的 `click()`——后者会先
 *   `scrollIntoViewIfNeeded`，把待验证的滚动量在点击之前就改掉，而当前导航目标
 *   （`is-current`）正是由滚动量决定的。
 * - 归一化只抹掉生成 id、`data-v-` 哈希与 `--webqq-*` 里的实测像素值。**不抹整个
 *   `style` 属性**：`v-show` 的 `display: none` 正是「原文一旦挂载就留着」的观察面，
 *   抹掉它这份快照就看不出「挂载但隐藏」与「从未挂载」的区别。
 */
const [output, engineName = 'chromium'] = process.argv.slice(2)
if (!output) throw new Error('用法：node dom-snapshot.mjs <输出 json> [chromium|firefox]')

const ANALYSIS = '.webqq-model-analysis'
const SCROLLER = '.webqq-model-request-detail'

const engine = engineName === 'firefox' ? firefox : chromium
const browser = await engine.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
const consoleErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => consoleErrors.push(String(error)))

/** 抹掉与本轮改动无关的易变部分。 */
function normalize(html) {
  return html
    .replace(/(id|for|aria-labelledby|aria-controls|aria-describedby)="[^"]*(reka|radix|v-\d)[^"]*"/g, '$1="<生成 id>"')
    .replace(/data-v-[0-9a-f]+/g, 'data-v-<hash>')
    .replace(/(--webqq-[a-z-]+):\s*[\d.]+px/g, '$1: <实测像素>')
}

const samples = []
const documents = []

async function sample(label) {
  await page.waitForTimeout(900)
  const raw = await page.locator(ANALYSIS).innerHTML()
  const dom = normalize(raw)
  documents.push(`===== ${label} =====\n${dom}\n`)
  samples.push({
    label,
    length: dom.length,
    sha256: createHash('sha256').update(dom).digest('hex').slice(0, 32),
    scrollTop: await page.locator(SCROLLER).evaluate(element => element.scrollTop),
    collapsedMessageCards: await page.locator(`${ANALYSIS} .webqq-model-analysis-card.is-collapsed`).count(),
    collapsedVariableCards: await page.locator(`${ANALYSIS} .webqq-model-analysis-variable-card.is-collapsed`).count(),
    expandedTools: await page.locator(`${ANALYSIS} .webqq-model-analysis-tool-card.is-expanded`).count(),
    collapsedNavGroups: await page.locator(`${ANALYSIS} .webqq-model-analysis-nav-group.is-collapsed`).count(),
    // 已挂载的原文块与其中隐藏着的那些：两个数字合起来就是「原文一旦挂载就留着」。
    mountedRawBlocks: await page.locator(`${ANALYSIS} .webqq-model-analysis-json`).count(),
    hiddenRawBlocks: await page.locator(`${ANALYSIS} .webqq-model-analysis-json`)
      .evaluateAll(elements => elements.filter(element => element.style.display === 'none').length),
    historyPreviews: await page.locator(`${ANALYSIS} .webqq-model-history-preview`).count(),
    currentNavTarget: await page.locator(`${ANALYSIS} .webqq-model-analysis-nav-item.is-current`)
      .evaluateAll(elements => elements.map(element => element.dataset.target)),
    cardHeaderLabels: await page.locator(`${ANALYSIS} .webqq-model-analysis-card header button`)
      .evaluateAll(elements => elements.map(element => element.getAttribute('aria-label'))),
    navExpanded: await page.locator(`${ANALYSIS} .webqq-model-analysis-nav-heading`)
      .evaluateAll(elements => elements.map(element => element.getAttribute('aria-expanded'))),
  })
}

/** 按无障碍标签点一个分析视图内的按钮，不经 Playwright 的滚动。 */
async function clickLabel(label) {
  const target = page.locator(`${ANALYSIS} [aria-label="${label}"]`).first()
  await target.evaluate(element => element.click())
  await page.waitForTimeout(700)
}

async function clickSelector(selector, index = 0) {
  await page.locator(`${ANALYSIS} ${selector}`).nth(index).evaluate(element => element.click())
  await page.waitForTimeout(700)
}

await page.goto('http://127.0.0.1:5140/chatluna-sandbox', { waitUntil: 'networkidle' })
await page.waitForSelector('.webqq-workspace', { timeout: 30_000 })
await page.waitForTimeout(1500)
await page.locator('.webqq-rail-button', { hasText: '模型请求' }).first().click()
await page.waitForTimeout(2000)
// 按序号取第一条记录：列表默认倒序，自动刷新默认关闭，本次不触发新的模型请求。
await page.locator('.webqq-model-request-item').first().click()
await page.waitForSelector(ANALYSIS, { timeout: 30_000 })
await page.waitForTimeout(2500)

await sample('01 初始渲染')

// 折叠第 3 条：它是本条记录里唯一命中搜索词的消息卡片，采样点 08 因此能看出
// 「搜索命中时相关卡片自动展开」，而不只是工具那一半。
await clickLabel('收起第 3 条消息卡片')
await sample('02 折叠一张卡')

await clickSelector('.webqq-model-analysis-tool-summary', 0)
await sample('03 展开一个工具')

await clickLabel('查看第 1 条消息原始 JSON')
await sample('04 切某条消息看原文')

await clickLabel('查看第 1 条消息格式化内容')
await sample('05 再切回格式化')

await clickLabel('查看响应原始 JSON')
await sample('06 切响应原文')

await clickLabel('查看变量 history_new 的原始 XML')
await sample('07 展开历史变量原文')

await page.locator('input[aria-label="搜索轨迹事件"]').evaluate((element) => {
  element.value = '群'
  element.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(2000)
await sample('08 搜索命中后的展开态')

await clickSelector('.webqq-model-analysis-nav-heading', 4)
await sample('09 折叠一个导航分组')

await page.locator('.webqq-model-request-item').nth(1).click()
await page.waitForTimeout(3500)
await sample('10 切换到另一条记录')

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify({ engine: engineName, samples, consoleErrors }, null, 2)}\n`)
const documentPath = join(process.env.DOM_TEXT_DIR ?? '/tmp', `${output.split('/').pop().replace(/\.json$/, '')}.txt`)
writeFileSync(documentPath, documents.join('\n'))
console.log(`采样点 ${samples.length} 个（${engineName}）→ ${output}；全文 → ${documentPath}；控制台错误 ${consoleErrors.length} 条`)

await context.close()
await browser.close()
