import { SandboxMcpError } from './types'

/**
 * 工具参数的取值助手。
 *
 * 测试控制端点按既有决定只把 inputSchema 当文档暴露、两种协议表述都不做参数校验，校验责任落在
 * 工具执行体内部，因此这几个助手同时被工具注册表与测试控制服务读取，单独成文件避免两者互相 import。
 */

export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new SandboxMcpError('invalid_arguments', `${name} 不能为空`)
  return value.trim()
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SandboxMcpError('invalid_arguments', '工具参数必须是对象')
  return value as Record<string, unknown>
}

/**
 * 参数里的空间标识原文。
 *
 * 非字符串一律视为省略，与空间解析的口径一致；刻意不 trim——事件归属与媒体缓存键取的是原文，
 * 只有空间解析自己会去掉首尾空白。三处读它（调用治理建运行时、等待类按空间过滤事件、记录域
 * 自己解析空间），因此收在这里一份。
 */
export function readSpaceId(args: Record<string, unknown>): string | undefined {
  return typeof args.spaceId === 'string' ? args.spaceId : undefined
}

/**
 * 与键序无关的稳定序列化。
 *
 * 幂等键的参数指纹与确认令牌的参数指纹都取它：同一份参数换个书写顺序必须得到同一个摘要，
 * 否则同键重放会被判成「不同参数」。
 */
export function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(',')}}`
  return JSON.stringify(value)
}
