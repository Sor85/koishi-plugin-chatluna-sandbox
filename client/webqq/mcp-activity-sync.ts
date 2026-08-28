import { ref } from 'vue'
import type { McpAdminPort } from './mcp-admin-port'

/**
 * 一个页面的 MCP 服务器活动指示灯。广播与初始查询各自都能点亮它，但先到的那个说了算：
 * 初始查询往返期间到达的广播不得被随后返回的查询结果盖掉。
 */
export function createMcpActivitySync(port: McpAdminPort) {
  const running = ref(false)
  let received = false
  const unsubscribe = port.subscribeMcpActivity((payload) => {
    received = true
    running.value = payload.running
  })
  void port.getMcpActivity().then((payload) => {
    if (!received) running.value = payload.running
  }).catch(() => {
    // MCP 未启用时不注册该 RPC，顶栏保持空闲态。
    if (!received) running.value = false
  })
  return { running, dispose: unsubscribe }
}
