import { chromium, firefox } from 'playwright'
import { writeFileSync } from 'node:fs'

/**
 * 四个区域视图的 DOM 快照。模型输出的比对是主证据；这一份是兜底，专门守住模板绑定被改坏的情况
 * ——四个工作台模型的字段名与形状如果在收拢时改动，模型比对看不出来（它比的是模型本身），
 * 只有渲染结果会变。
 *
 * 确定性：每次用全新浏览器上下文（因此本地偏好为空，首屏视图固定），按导航按钮的可见文案点击、
 * 不按序号，固定等待，全程只读不写。
 */
const [output, engineName = 'chromium'] = process.argv.slice(2)
if (!output) throw new Error('用法：node dom-snapshot.mjs <输出> [chromium|firefox]')

const engine = engineName === 'firefox' ? firefox : chromium
const browser = await engine.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const consoleErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => consoleErrors.push(String(error)))

await page.goto('http://127.0.0.1:5140/chatluna-sandbox', { waitUntil: 'networkidle' })
await page.waitForSelector('.webqq-workspace', { timeout: 30_000 })
await page.waitForTimeout(1500)

/** 抹掉与本次改动无关的易变部分：时刻、随机化 id、内联的测量值。 */
function normalize(html) {
  return html
    .replace(/\d{2}:\d{2}(:\d{2})?/g, '<时刻>')
    .replace(/\d{4}-\d{2}-\d{2}/g, '<日期>')
    .replace(/(id|for|aria-labelledby|aria-controls|aria-describedby)="[^"]*(reka|radix|v-)[^"]*"/g, '$1="<生成 id>"')
    .replace(/style="[^"]*"/g, 'style="<内联>"')
    .replace(/data-v-[0-9a-f]+/g, 'data-v-<hash>')
}

const samples = []

async function sample(label) {
  await page.waitForTimeout(800)
  const root = await page.locator('.webqq-workspace').innerHTML()
  samples.push({
    label,
    dom: normalize(root),
    domLength: root.length,
    // 转圈与错误横幅是本轮唯一可能变的可见部分，单独读一次，便于比对时定位。
    spinners: await page.locator('.webqq-workspace [class*="spinner"], .webqq-workspace [class*="loading"]').count(),
    errorTexts: (await page.locator('.webqq-workspace [class*="error"]').allInnerTexts()).map((text) => text.trim()),
  })
}

async function openView(label) {
  await page.locator('.webqq-rail-button', { hasText: label }).first().click()
  await page.waitForTimeout(1200)
}

await sample('首屏')
for (const label of ['模型请求', '预设', 'OneBot 调试', 'MCP 调用', '消息']) {
  await openView(label)
  await sample(label)
}

writeFileSync(output, `${JSON.stringify({ engine: engineName, samples, consoleErrors }, null, 2)}\n`)
console.log(`采样点 ${samples.length} 个（${engineName}）→ ${output}；控制台错误 ${consoleErrors.length} 条`)

await context.close()
await browser.close()
