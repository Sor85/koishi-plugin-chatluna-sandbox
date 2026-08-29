/**
 * 记录时间的展示格式。
 *
 * 时区是显式参数而不是隐式的运行时默认值：不给 timeZone 时仍按浏览器本地时区渲染，
 * 与用户看到的一致；测试则必须指名时区，否则「同一时刻算哪一天」会随跑测试的机器变化，
 * 跨日、跨年与午夜这三个边界根本没法断言。
 */
export interface SandboxDateTimeOptions {
  timeZone?: string
}

const INVALID_TIME_TEXT = '—'

export function formatSandboxDateTime(
  value: string | number | Date,
  options: SandboxDateTimeOptions = {},
): string {
  const time = toEpochMs(value)
  // 采集侧可能写入空字符串或被截断的时间戳；渲染成 NaN-NaN-NaN 比缺省符号更难看懂。
  if (time === undefined) return INVALID_TIME_TEXT
  const parts = new Intl.DateTimeFormat('en-US', {
    ...options.timeZone ? { timeZone: options.timeZone } : {},
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // h23 而不是 hour12: false：后者在部分 ICU 版本下把午夜渲染成 24 点。
    hourCycle: 'h23',
  }).formatToParts(new Date(time))
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`
}

function toEpochMs(value: string | number | Date): number | undefined {
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}
