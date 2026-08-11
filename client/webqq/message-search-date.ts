import { parseDate, type DateValue } from '@internationalized/date'

export interface MessageSearchDateRange {
  createdAtStart: string
  createdAtEnd: string
}

export function localDateToCalendarValue(value: string): DateValue | undefined {
  try {
    return value ? parseDate(value) : undefined
  } catch {
    return undefined
  }
}

export function calendarValueToLocalDate(value: DateValue | undefined): string {
  return value?.toString() ?? ''
}

export function localDateToMessageSearchRange(value: string): MessageSearchDateRange | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const start = new Date(year, month - 1, day)
  if (
    start.getFullYear() !== year
    || start.getMonth() !== month - 1
    || start.getDate() !== day
  ) return undefined

  // 按本地日历推进到次日零点，不能固定加 24 小时，否则夏令时切换日会偏移。
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return {
    createdAtStart: start.toISOString(),
    createdAtEnd: end.toISOString(),
  }
}
