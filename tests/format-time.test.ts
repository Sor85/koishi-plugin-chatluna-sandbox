import { describe, expect, it } from 'vitest'
import { formatSandboxDateTime } from '../client/webqq/format-time'

describe('记录时间格式化', () => {
  it('按年月日时分秒补零渲染，并按给定时区解释时刻', () => {
    expect(formatSandboxDateTime('2026-08-29T06:07:08.000Z', { timeZone: 'UTC' })).toBe('2026-08-29 06:07:08')
    expect(formatSandboxDateTime('2026-08-29T06:07:08.000Z', { timeZone: 'Asia/Shanghai' })).toBe('2026-08-29 14:07:08')
  })

  it('同一时刻在不同时区可能落在不同的日历日', () => {
    const instant = '2026-08-29T20:30:00.000Z'
    expect(formatSandboxDateTime(instant, { timeZone: 'UTC' })).toBe('2026-08-29 20:30:00')
    // 东八区已经跨到次日，美西仍是当天下午——日期部分必须跟着时区走，不能只换小时。
    expect(formatSandboxDateTime(instant, { timeZone: 'Asia/Shanghai' })).toBe('2026-08-30 04:30:00')
    expect(formatSandboxDateTime(instant, { timeZone: 'America/Los_Angeles' })).toBe('2026-08-29 13:30:00')
  })

  it('午夜渲染成 00 点而不是 24 点', () => {
    expect(formatSandboxDateTime('2026-08-29T16:00:00.000Z', { timeZone: 'Asia/Shanghai' })).toBe('2026-08-30 00:00:00')
    expect(formatSandboxDateTime('2026-08-29T00:00:00.000Z', { timeZone: 'UTC' })).toBe('2026-08-29 00:00:00')
  })

  it('跨年边界按目标时区的年份渲染', () => {
    const newYearEve = '2026-12-31T16:00:00.000Z'
    expect(formatSandboxDateTime(newYearEve, { timeZone: 'UTC' })).toBe('2026-12-31 16:00:00')
    expect(formatSandboxDateTime(newYearEve, { timeZone: 'Asia/Shanghai' })).toBe('2027-01-01 00:00:00')
  })

  it('接受时间戳与 Date，非法时间给缺省符号', () => {
    expect(formatSandboxDateTime(Date.parse('2026-08-29T06:07:08.000Z'), { timeZone: 'UTC' })).toBe('2026-08-29 06:07:08')
    expect(formatSandboxDateTime(new Date('2026-08-29T06:07:08.000Z'), { timeZone: 'UTC' })).toBe('2026-08-29 06:07:08')
    expect(formatSandboxDateTime('', { timeZone: 'UTC' })).toBe('—')
    expect(formatSandboxDateTime('尚未采集', { timeZone: 'UTC' })).toBe('—')
    expect(formatSandboxDateTime(Number.NaN, { timeZone: 'UTC' })).toBe('—')
  })

  it('不给时区时仍按本地时区渲染，与用户在界面上看到的一致', () => {
    const local = new Date(2026, 7, 29, 14, 7, 8)
    expect(formatSandboxDateTime(local)).toBe('2026-08-29 14:07:08')
  })
})
