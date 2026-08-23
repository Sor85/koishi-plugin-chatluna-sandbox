import { receive, send } from '@koishijs/client'
import { ref } from 'vue'

export type McpActivityPayload = { running: boolean }
type McpActivityListener = (payload: McpActivityPayload) => void

const activityListeners = new Set<McpActivityListener>()
let receiverInstalled = false

function notifyActivityListeners(payload: McpActivityPayload) {
  for (const listener of activityListeners) listener(payload)
}

function installActivityReceiver() {
  if (receiverInstalled) return
  receiverInstalled = true
  // Koishi receive 对同名事件只保存一个回调；页面反复挂载时若直接注册，后卸载的页面会留下失效回调并覆盖存活页面。
  receive<McpActivityPayload>('chatluna-sandbox/mcp-activity', notifyActivityListeners)
}

interface McpActivityContext {
  on(event: 'chatluna-sandbox/mcp-activity', callback: McpActivityListener): unknown
}

export function installContextMcpActivityReceiver(ctx: unknown) {
  const context = ctx as McpActivityContext
  // Console 的预构建入口与插件源码可能各自持有一份 @koishijs/client；主 Context 事件总线
  // 才是服务端广播实际抵达的位置，不能只依赖模块级 receive 单例。
  context.on('chatluna-sandbox/mcp-activity', notifyActivityListeners)
}

export function createMcpActivitySync() {
  const running = ref(false)
  installActivityReceiver()
  let received = false
  const listener: McpActivityListener = (payload) => {
    received = true
    running.value = payload.running
  }
  activityListeners.add(listener)
  void send('chatluna-sandbox/mcp-activity').then((payload) => {
    // 初始查询不得盖掉已经到达的实时广播。
    if (!received) running.value = payload.running
  }).catch(() => {
    // MCP 未启用时不注册该 RPC，顶栏保持空闲态。
    if (!received) running.value = false
  })
  return {
    running,
    dispose: () => { activityListeners.delete(listener) },
  }
}
