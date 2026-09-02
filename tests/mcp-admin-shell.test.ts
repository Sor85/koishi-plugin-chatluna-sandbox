import { describe, expect, it } from 'vitest'
import { FakeMcpAdminPort } from '../client/mcp/fake-port'
import { createMcpCapabilityCatalogLoader, createMcpCredentialAdmin, formatMcpScopes } from '../client/mcp/shell'
import type { SandboxMcpPublicCredential } from '../src/mcp/types'

function credential(overrides: Partial<SandboxMcpPublicCredential> = {}): SandboxMcpPublicCredential {
  return {
    id: 'credential-0',
    name: '控制器',
    scopes: ['read'],
    enabled: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('MCP 凭证管理', () => {
  it('刷新后按服务端返回的顺序列出凭证', async () => {
    const port = new FakeMcpAdminPort()
    port.credentials = [credential({ id: 'a', name: '甲' }), credential({ id: 'b', name: '乙' })]
    const admin = createMcpCredentialAdmin(port)

    await admin.refresh()

    expect(admin.credentials.value.map(({ name }) => name)).toEqual(['甲', '乙'])
  })

  it('创建成功后展示 Token 弹窗、关闭表单、重置为默认权限并重新列举', async () => {
    const port = new FakeMcpAdminPort()
    const admin = createMcpCredentialAdmin(port)

    admin.openCreate()
    admin.name.value = '新控制器'
    admin.toggleScope('manage', true)
    await admin.submitForm()

    expect(admin.createdToken.value).toBe('token-1')
    expect(admin.tokenOpen.value).toBe(true)
    expect(admin.formOpen.value).toBe(false)
    expect(admin.scopes.value).toEqual(['read'])
    expect(admin.credentials.value.map(({ name }) => name)).toEqual(['新控制器'])
    expect(port.calls.map(({ operation }) => operation)).toEqual(['createMcpCredential', 'listMcpCredentials'])
  })

  it('名称为空或权限为空时不发请求，只给出提示', async () => {
    const port = new FakeMcpAdminPort()
    const admin = createMcpCredentialAdmin(port)

    admin.openCreate()
    admin.name.value = '   '
    await admin.submitForm()
    expect(admin.error.value).toBe('请填写名称并至少选择一项权限。')

    admin.name.value = '控制器'
    admin.toggleScope('read', false)
    await admin.submitForm()
    expect(admin.error.value).toBe('请填写名称并至少选择一项权限。')
    expect(port.calls).toEqual([])
  })

  it('创建失败时保留表单并显示服务端错误，saving 复位', async () => {
    const port = new FakeMcpAdminPort()
    port.rejectNext('createMcpCredential', new Error('名称重复'))
    const admin = createMcpCredentialAdmin(port)

    admin.openCreate()
    admin.name.value = '控制器'
    await admin.submitForm()

    expect(admin.error.value).toBe('名称重复')
    expect(admin.formOpen.value).toBe(true)
    expect(admin.tokenOpen.value).toBe(false)
    expect(admin.saving.value).toBe(false)
  })

  it('打开已有凭证时载入它的名称与权限，保存后关闭表单并重新列举', async () => {
    const port = new FakeMcpAdminPort()
    port.credentials = [credential({ id: 'a', name: '甲', scopes: ['read', 'debug'] })]
    const admin = createMcpCredentialAdmin(port)
    await admin.refresh()

    admin.openEdit(admin.credentials.value[0]!)
    expect(admin.name.value).toBe('甲')
    expect(admin.scopes.value).toEqual(['read', 'debug'])

    admin.name.value = '甲改'
    await admin.submitForm()

    expect(admin.formOpen.value).toBe(false)
    expect(admin.editing.value).toBeNull()
    expect(admin.credentials.value[0]?.name).toBe('甲改')
  })

  it('权限开关按勾选状态增删，且同一权限不会重复', () => {
    const port = new FakeMcpAdminPort()
    const admin = createMcpCredentialAdmin(port)

    admin.toggleScope('read', true)
    admin.toggleScope('interact', true)
    expect(admin.scopes.value).toEqual(['read', 'interact'])

    admin.toggleScope('read', false)
    expect(admin.scopes.value).toEqual(['interact'])
  })

  it('轮换 Token 后详情换成新凭证并暴露新 Token', async () => {
    const port = new FakeMcpAdminPort()
    port.credentials = [credential({ id: 'a' })]
    const admin = createMcpCredentialAdmin(port)
    await admin.refresh()
    admin.openEdit(admin.credentials.value[0]!)

    await admin.rotateToken()

    expect(admin.createdToken.value).toBe('token-1')
    expect(admin.editing.value?.token).toBe('token-1')
  })

  it('启停按当前状态取反，撤销后凭证从列表消失', async () => {
    const port = new FakeMcpAdminPort()
    port.credentials = [credential({ id: 'a', enabled: true })]
    const admin = createMcpCredentialAdmin(port)
    await admin.refresh()

    await admin.toggleCredential(admin.credentials.value[0]!)
    expect(port.calls.at(-2)).toEqual({ operation: 'setMcpCredentialEnabled', input: { id: 'a', enabled: false } })
    expect(admin.credentials.value[0]?.enabled).toBe(false)

    await admin.revokeCredential('a')
    expect(admin.credentials.value).toEqual([])
  })

  it('权限标签按固定顺序拼接，未知权限原样保留', () => {
    expect(formatMcpScopes(['read', 'manage'])).toBe('读取 · 环境管理')
    expect(formatMcpScopes(['unknown' as never])).toBe('unknown')
  })
})

describe('MCP 能力目录读取', () => {
  it('读取成功后交出目录并清空失败态', async () => {
    const port = new FakeMcpAdminPort()
    port.capabilities = {
      serverCapabilities: { tools: true, resources: false, prompts: false },
      scopes: ['read'],
      tools: [],
      resources: [],
    }
    const loader = createMcpCapabilityCatalogLoader(port)

    await loader.load()

    expect(loader.catalog.value?.serverCapabilities.tools).toBe(true)
    expect(loader.error.value).toBe('')
    expect(loader.loading.value).toBe(false)
  })

  it('读取失败时给出错误并复位加载态', async () => {
    const port = new FakeMcpAdminPort()
    port.rejectNext('getMcpCapabilities', new Error('MCP 未启用'))
    const loader = createMcpCapabilityCatalogLoader(port)

    await loader.load()

    expect(loader.error.value).toBe('MCP 未启用')
    expect(loader.catalog.value).toBeUndefined()
    expect(loader.loading.value).toBe(false)
  })

  it('重试会清掉上一次的错误', async () => {
    const port = new FakeMcpAdminPort()
    port.rejectNext('getMcpCapabilities', new Error('MCP 未启用'))
    const loader = createMcpCapabilityCatalogLoader(port)

    await loader.load()
    await loader.load()

    expect(loader.error.value).toBe('')
    expect(loader.catalog.value).toBeDefined()
  })
})
