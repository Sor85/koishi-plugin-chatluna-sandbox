import { receive, send } from '@koishijs/client'
import type { McpActivityListener, McpActivityPayload, McpAdminPort } from './mcp-admin-port'

const activityListeners = new Set<McpActivityListener>()
let receiverInstalled = false

function notifyActivityListeners(payload: McpActivityPayload) {
  for (const listener of activityListeners) listener(payload)
}

function installActivityReceiver() {
  if (receiverInstalled) return
  receiverInstalled = true
  // Koishi receive 对同名事件只保存一个回调；页面反复挂载时若每次都注册，后卸载的页面会
  // 留下失效回调并覆盖存活页面。这里只注册一次，再由适配器扇出给全部订阅者。
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

export function createKoishiMcpAdminPort(): McpAdminPort {
  return {
    listMcpCredentials: () => send('chatluna-sandbox/mcp-credentials'),
    createMcpCredential: (input) => send('chatluna-sandbox/create-mcp-credential', input),
    updateMcpCredential: (input) => send('chatluna-sandbox/update-mcp-credential', input),
    rotateMcpCredentialToken: (input) => send('chatluna-sandbox/rotate-mcp-credential-token', input),
    setMcpCredentialEnabled: (input) => send('chatluna-sandbox/set-mcp-credential-enabled', input),
    revokeMcpCredential: (input) => send('chatluna-sandbox/revoke-mcp-credential', input),
    getMcpCapabilities: () => send('chatluna-sandbox/mcp-capabilities'),
    getMcpActivity: () => send('chatluna-sandbox/mcp-activity'),
    subscribeMcpActivity: (listener) => {
      installActivityReceiver()
      activityListeners.add(listener)
      return () => { activityListeners.delete(listener) }
    },
  }
}
