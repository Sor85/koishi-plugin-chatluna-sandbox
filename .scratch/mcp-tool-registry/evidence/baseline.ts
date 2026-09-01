/**
 * 测试控制端点对外自述的确定性基线：能力目录完整输出与 40 个工具的参数 schema 完整 JSON。
 *
 * 只驱动测试控制服务的公开读取入口（`getCapabilityCatalog`、`listTools`、`readResource`），三者
 * 在本轮收拢前后都存在，因此同一份脚本既能跑 HEAD 也能跑工作区，输出可以逐字节比对。
 *
 * schema 顺序与工具顺序都不排序：`tools/list` 的返回顺序本身就是对外契约的一部分，一次条目
 * 搬家造成的顺序变化必须表现为 diff 而不是被规整掉。幂等键说明由实例配置决定，因此非默认配额
 * 与非默认幂等窗口各采一份，钉住「读取时注入」这条保证。
 *
 * 用法：npx tsx .scratch/mcp-tool-registry/evidence/baseline.ts > .scratch/mcp-tool-registry/evidence/<名字>.json
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App } from '@koishijs/core'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../../../src/control-service'
import { SandboxMcpService, type SandboxMcpServiceOptions } from '../../../src/mcp/service'
import { SandboxTestSpaceService } from '../../../src/test-spaces'

const ALL_SCOPES = ['read', 'interact', 'manage', 'debug'] as const

function createService(options: Partial<SandboxMcpServiceOptions> = {}) {
  const app = new App()
  const directory = mkdtempSync(join(tmpdir(), 'chatluna-sandbox-mcp-baseline-'))
  const runtimeBots = new SandboxRuntimeBotRegistry()
  const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media'), runtimeBots })
  const testSpaces = new SandboxTestSpaceService(app, runtimeBots)
  const service = new SandboxMcpService(app, control, { dataDirectory: directory, testSpaces, ...options })
  return { app, service }
}

/** 一份完整自述：能力目录、按能力范围过滤的清单、指南资源与错误码资源。 */
function describe(options: Partial<SandboxMcpServiceOptions> = {}) {
  const { app, service } = createService(options)
  const credential = service.createCredential('基线凭证', [...ALL_SCOPES])
  const catalog = service.getCapabilityCatalog()
  const snapshot = {
    capabilityCatalog: catalog,
    // 每个工具的参数 schema 单独再列一份：能力目录里它是条目的一个字段，这里按工具名成表，
    // 便于 diff 直接指出是哪个工具的哪个参数变了。
    toolSchemas: catalog.tools.map(({ name, inputSchema }) => ({ name, inputSchema })),
    toolsByScope: Object.fromEntries(ALL_SCOPES.map((scope) => {
      const scoped = service.createCredential(`基线凭证-${scope}`, [scope])
      return [scope, service.listTools(scoped.token).map(({ name, scope: toolScope }) => ({ name, scope: toolScope }))]
    })),
    guideResource: service.readResource(credential.token, 'chatluna-sandbox://guide'),
    errorsResource: service.readResource(credential.token, 'chatluna-sandbox://errors'),
    examplesResource: service.readResource(credential.token, 'chatluna-sandbox://examples'),
    sceneSchemaResource: service.readResource(credential.token, 'chatluna-sandbox://scene-schema'),
    napcatResource: service.readResource(credential.token, 'chatluna-sandbox://capabilities/napcat'),
    llbotResource: service.readResource(credential.token, 'chatluna-sandbox://capabilities/llbot'),
    resources: service.listResources(credential.token),
  }
  return { app, snapshot }
}

async function main() {
  const defaults = describe()
  // 非默认幂等窗口：条数与有效期都改掉，钉住幂等键说明在读取时按实例配置改写这条保证。
  const custom = describe({ idempotencyLimit: 7, idempotencyTtlMs: 45_000 })
  process.stdout.write(`${JSON.stringify({
    default: defaults.snapshot,
    customIdempotencyWindow: custom.snapshot,
  }, null, 2)}\n`)
  await Promise.all([defaults.app.stop(), custom.app.stop()])
}

void main()
