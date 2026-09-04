import { ref } from 'vue'
import type { SandboxTestPublicCredential, SandboxMcpScope } from '../../src/mcp/types'
import type { McpAdminPort } from './port'

export const MCP_SCOPE_OPTIONS = [
  { value: 'read', label: '读取' },
  { value: 'interact', label: '交互' },
  { value: 'manage', label: '环境管理' },
  { value: 'debug', label: '调试' },
] as const satisfies ReadonlyArray<{ value: SandboxMcpScope; label: string }>

export function formatMcpScopes(values: readonly SandboxMcpScope[]) {
  return values.map((scope) => MCP_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope).join(' · ')
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback
}

/**
 * 测试凭证管理的表单状态机与端口接线。每个写操作成功后都重新列举一次，因为服务端是
 * 凭证的唯一拥有者——本地拼接结果会在 Token 明文可见性这类派生字段上和服务端分叉。
 */
export function createTestCredentialAdmin(port: McpAdminPort) {
  const credentials = ref<SandboxTestPublicCredential[]>([])
  const formOpen = ref(false)
  const tokenOpen = ref(false)
  const saving = ref(false)
  const editing = ref<SandboxTestPublicCredential | null>(null)
  const name = ref('')
  const scopes = ref<SandboxMcpScope[]>(['read'])
  const createdToken = ref('')
  const error = ref('')

  async function refresh() {
    credentials.value = await port.listTestCredentials()
  }

  function resetForm() {
    name.value = ''
    scopes.value = ['read']
    error.value = ''
  }

  function openCreate() {
    editing.value = null
    resetForm()
    formOpen.value = true
  }

  function openEdit(credential: SandboxTestPublicCredential) {
    editing.value = credential
    name.value = credential.name
    scopes.value = [...credential.scopes]
    error.value = ''
    formOpen.value = true
  }

  function toggleScope(scope: SandboxMcpScope, enabled: boolean) {
    scopes.value = enabled
      ? [...new Set([...scopes.value, scope])]
      : scopes.value.filter((item) => item !== scope)
  }

  function validateForm() {
    error.value = ''
    if (name.value.trim() && scopes.value.length) return true
    error.value = '请填写名称并至少选择一项权限。'
    return false
  }

  async function guard(fallback: string, action: () => Promise<void>) {
    saving.value = true
    try {
      await action()
    } catch (cause) {
      error.value = messageOf(cause, fallback)
    } finally {
      saving.value = false
    }
  }

  async function createCredential() {
    if (!validateForm()) return
    await guard('创建凭证失败', async () => {
      const created = await port.createTestCredential({ name: name.value, scopes: scopes.value })
      createdToken.value = created.token
      resetForm()
      formOpen.value = false
      tokenOpen.value = true
      await refresh()
    })
  }

  async function saveCredential() {
    if (!editing.value || !validateForm()) return
    const id = editing.value.id
    await guard('保存凭证失败', async () => {
      await port.updateTestCredential({ id, name: name.value, scopes: scopes.value })
      formOpen.value = false
      editing.value = null
      await refresh()
    })
  }

  async function submitForm() {
    if (editing.value) await saveCredential()
    else await createCredential()
  }

  async function rotateToken() {
    if (!editing.value) return
    const id = editing.value.id
    error.value = ''
    await guard('重新生成 Token 失败', async () => {
      const rotated = await port.rotateTestCredentialToken({ id })
      editing.value = rotated
      createdToken.value = rotated.token
      await refresh()
    })
  }

  async function toggleCredential(credential: SandboxTestPublicCredential) {
    await port.setTestCredentialEnabled({ id: credential.id, enabled: !credential.enabled })
    await refresh()
  }

  async function revokeCredential(id: string) {
    await port.revokeTestCredential({ id })
    await refresh()
  }

  return {
    createdToken,
    credentials,
    editing,
    error,
    formOpen,
    name,
    openCreate,
    openEdit,
    refresh,
    revokeCredential,
    rotateToken,
    saving,
    scopes,
    submitForm,
    toggleCredential,
    toggleScope,
    tokenOpen,
  }
}

/**
 * 一次性目录读取的共用骨架：独立的加载态与失败态，失败只落成一条消息而不向外抛。
 *
 * 两种协议表述的能力目录各自调用一次这个工厂，因此各有一份状态：一页读失败不会把另一页
 * 也拖成失败态，重试也只重试自己那一次读取。
 */
function createCatalogLoader<Catalog>(read: () => Promise<Catalog>, failureMessage: string) {
  const catalog = ref<Catalog>()
  const loading = ref(false)
  const error = ref('')

  async function load() {
    loading.value = true
    error.value = ''
    try {
      catalog.value = await read()
    } catch (cause) {
      error.value = messageOf(cause, failureMessage)
    } finally {
      loading.value = false
    }
  }

  return { catalog, error, load, loading }
}

/** MCP 能力目录的一次性读取，带独立的加载与失败态。 */
export function createMcpCapabilityCatalogLoader(port: McpAdminPort) {
  return createCatalogLoader(() => port.getMcpCapabilities(), '读取 MCP 能力失败')
}

/** HTTP 测试接口自述的一次性读取：路由、请求体上限与错误码到状态码的映射。 */
export function createHttpApiCapabilityCatalogLoader(port: McpAdminPort) {
  return createCatalogLoader(() => port.getHttpApiCapabilities(), '读取 HTTP 能力失败')
}
