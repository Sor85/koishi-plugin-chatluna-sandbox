import { readFileSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { App } from '@koishijs/core'
import { afterEach, describe, expect, it } from 'vitest'
import { registerConsole, type SandboxConsoleRegistrar } from '../src/console'
import { SandboxControlService, SandboxRuntimeBotRegistry } from '../src/control-service'
import { SandboxMcpService } from '../src/mcp/service'
import { SandboxPresetService } from '../src/presets'
import { SandboxTestSpaceService } from '../src/test-spaces'
import type { SandboxAppearance } from '../src/types'

/**
 * Console 契约的端点集合、注册的监听器集合与客户端消费方集合被钉在一起。
 *
 * 声明集合与消费方名单没有别的观察面——interface 的键在运行时不存在，`send` 的调用点也
 * 只以字符串字面量出现——因此这条守卫读源码。这是 ADR-0073 明示的架构守卫例外，谓词按
 * 形状判定：任何叫 `Sandbox*ConsoleEvents` 的分组都自动进端点集合，新增分组不必改守卫。
 *
 * 注册集合不读源码：假 Console 收集 `registerConsole` 实际登记的事件名，那是服务端真相。
 */
const CONTRACT_FILE = 'src/console-contract.ts'
const ENDPOINT_GROUP_PATTERN = /ConsoleEvents$/
const BROADCAST_MAP_NAME = 'SandboxConsoleBroadcasts'
const CONTRACT_KEY_PATTERN = /^\s*'(chatluna-sandbox\/[a-z-]+)'\s*[:?]/gm
const CLIENT_SEND_PATTERN = /send\(\s*'(chatluna-sandbox\/[a-z-]+)'/g

const appearance: SandboxAppearance = {
  enableSandboxFrostedGlass: true,
  sandboxTimBubbleTail: true,
  sandboxColorMode: 'auto',
  sandboxAccentColor: '#2563eb',
  sandboxMarkRecalledMessages: true,
}

/**
 * 按大括号配平切出每个 `export interface` 的正文。正则的 `[^}]*` 会被入参里的行内对象类型
 * （`{ recordId: string }`）提前截断，因此这里数括号而不是靠一条正则一口吃下整块。
 */
function readInterfaceBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>()
  const header = /export interface ([A-Za-z]+)\s*(?:extends[\s\S]*?)?\{/g
  for (let match = header.exec(source); match; match = header.exec(source)) {
    let depth = 1
    let index = match.index + match[0].length
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') depth -= 1
      index += 1
    }
    blocks.set(match[1]!, source.slice(match.index + match[0].length, index - 1))
    header.lastIndex = index
  }
  return blocks
}

function listContractKeys(block: string): string[] {
  return [...block.matchAll(CONTRACT_KEY_PATTERN)].map((match) => match[1]!)
}

function readDeclaredEndpoints(source: string): string[] {
  return [...readInterfaceBlocks(source)]
    .filter(([name]) => ENDPOINT_GROUP_PATTERN.test(name))
    .flatMap(([, block]) => listContractKeys(block))
}

function readDeclaredBroadcastChannels(source: string): string[] {
  return listContractKeys(readInterfaceBlocks(source).get(BROADCAST_MAP_NAME) ?? '')
}

function listClientSourceFiles(directory: string): string[] {
  return readdirSync(resolve(directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listClientSourceFiles(path)
    if (entry.name.endsWith('.d.ts')) return []
    return entry.name.endsWith('.ts') || entry.name.endsWith('.vue') ? [path] : []
  })
}

/**
 * 客户端消费方：任何客户端源码里的 `send('<端点>')`。只扫端口适配器会让这条守卫依赖
 * 「RPC 只出现在端口里」那条规则的豁免清单，两条规则各自成立更稳。
 */
function readClientConsumedEndpoints(): string[] {
  return listClientSourceFiles('client').flatMap((file) => (
    [...readFileSync(resolve(file), 'utf8').matchAll(CLIENT_SEND_PATTERN)].map((match) => match[1]!)
  ))
}

/**
 * 服务端自用或仅供外部工具的端点登记表。理由与负责人均为必填；登记不是放行，是有主的债务。
 *
 * 当前为空：`chatluna-sandbox/bot-deliveries` 曾是唯一的无主端点——服务端两份声明与注册点
 * 都有它，客户端补丁没有 `send` 重载，客户端也没有任何调用。按未发布阶段兼容策略删除，
 * 机器人事件投递的领域读取仍由 `SandboxControlService.getBotDeliveries` 与 MCP 工具承担。
 */
interface ServerOwnedEndpoint {
  readonly endpoint: string
  /** 必填：为什么这个端点没有客户端消费方仍然保留。 */
  readonly reason: string
  /** 必填：负责消化这条债务的后续工作。 */
  readonly owner: string
}

const serverOwnedEndpoints: readonly ServerOwnedEndpoint[] = []

interface EndpointSets {
  readonly declared: readonly string[]
  readonly registered: readonly string[]
  readonly consumed: readonly string[]
  readonly owned: readonly ServerOwnedEndpoint[]
}

/** 三种漂移各成一条：声明了没注册、注册了没声明、声明了没有任何消费方。 */
function findEndpointDrift({ declared, registered, consumed, owned }: EndpointSets): string[] {
  const declaredSet = new Set(declared)
  const registeredSet = new Set(registered)
  const consumedSet = new Set(consumed)
  const ownedSet = new Set(owned.map(({ endpoint }) => endpoint))
  return [
    ...[...declaredSet].filter((endpoint) => !registeredSet.has(endpoint))
      .map((endpoint) => `${endpoint} 在契约里声明了却没有注册监听器`),
    ...[...registeredSet].filter((endpoint) => !declaredSet.has(endpoint))
      .map((endpoint) => `${endpoint} 注册了监听器却没有进契约`),
    ...[...declaredSet].filter((endpoint) => !consumedSet.has(endpoint) && !ownedSet.has(endpoint))
      .map((endpoint) => `${endpoint} 没有任何消费方，也没有登记为服务端自用`),
  ].sort()
}

const runningApps: App[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.stop()))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

/**
 * 全部可选服务都在场时注册一次，收集实际登记的事件名。缺任何一个可选服务都会让它那组端点
 * 不被注册，比对因此必须在「全都在场」的形态下做。
 */
async function collectRegisteredEndpoints(): Promise<string[]> {
  const directory = await mkdtemp(join(tmpdir(), 'chatluna-sandbox-console-contract-'))
  temporaryDirectories.push(directory)
  const app = new App()
  runningApps.push(app)
  const runtimeBots = new SandboxRuntimeBotRegistry()
  const control = new SandboxControlService(app, { mediaDirectory: join(directory, 'media'), runtimeBots })
  const testSpaces = new SandboxTestSpaceService(app, runtimeBots)
  const mcp = new SandboxMcpService(app, control, { dataDirectory: directory })
  const presets = new SandboxPresetService({
    baseDir: join(directory, 'presets'),
    mainModelRequests: control.getModelRequestStore(),
  })
  const registered: string[] = []
  const registrar: SandboxConsoleRegistrar = {
    addEntry() {},
    addListener(event) {
      registered.push(event)
    },
    broadcast() {},
  }

  registerConsole(registrar, control, appearance, mcp, testSpaces, undefined, undefined, presets)

  return registered
}

describe('Console 契约端点集合', () => {
  it('契约集合与注册集合相等，且每个端点都有消费方', async () => {
    const source = readFileSync(resolve(CONTRACT_FILE), 'utf8')

    expect(findEndpointDrift({
      declared: readDeclaredEndpoints(source),
      registered: await collectRegisteredEndpoints(),
      consumed: readClientConsumedEndpoints(),
      owned: serverOwnedEndpoints,
    })).toEqual([])
  })

  /**
   * 契约被客户端补丁与端口模块一同引用。一处值导入就会把控制服务连同 Koishi 运行时打进
   * 前端产物，而这类回归不报错，只让产物默默变大，因此钉住「只有类型声明」。
   */
  it('契约只有类型声明，不把服务端运行时拖进前端产物', () => {
    const source = readFileSync(resolve(CONTRACT_FILE), 'utf8')

    expect([...source.matchAll(/^import\s+(?!type\b)/gm)]).toEqual([])
    expect(source).not.toMatch(/^(?:export )?(?:const|let|var|function|class)\s/m)
  })

  it('契约按能力分组书写，广播频道与请求端点各自登记', () => {
    const source = readFileSync(resolve(CONTRACT_FILE), 'utf8')
    const groups = [...readInterfaceBlocks(source)]
      .filter(([name, block]) => ENDPOINT_GROUP_PATTERN.test(name) && listContractKeys(block).length)

    expect(groups.length).toBeGreaterThan(1)
    // 同一个端点不得在两个分组里各写一遍：分组是给读的人用的，端点集合是它们的并集。
    const declared = readDeclaredEndpoints(source)
    expect(declared.length).toBe(new Set(declared).size)
    // `mcp-activity` 既是「现在跑着吗」的查询也是「状态变了」的通知，两处各自登记不算重复。
    expect(readDeclaredBroadcastChannels(source)).toEqual([
      'chatluna-sandbox/scene-mutated',
      'chatluna-sandbox/mcp-activity',
    ])
    expect(declared).toContain('chatluna-sandbox/mcp-activity')
  })

  /**
   * 谓词自测。这条不依赖登记表里有没有条目：清单清空后，「移除任一登记必须报错」变成
   * 空循环，只有喂合成集合才能证明三种漂移都还认得出。
   */
  it('三种漂移各喂一份合成输入都能被认出', () => {
    const base: EndpointSets = {
      declared: ['chatluna-sandbox/x'],
      registered: ['chatluna-sandbox/x'],
      consumed: ['chatluna-sandbox/x'],
      owned: [],
    }

    expect(findEndpointDrift(base)).toEqual([])
    expect(findEndpointDrift({ ...base, registered: [] }))
      .toEqual(['chatluna-sandbox/x 在契约里声明了却没有注册监听器'])
    expect(findEndpointDrift({ ...base, declared: [], consumed: [] }))
      .toEqual(['chatluna-sandbox/x 注册了监听器却没有进契约'])
    expect(findEndpointDrift({ ...base, consumed: [] }))
      .toEqual(['chatluna-sandbox/x 没有任何消费方，也没有登记为服务端自用'])
    // 登记为服务端自用只消掉「没有消费方」那一条，注册与声明的漂移仍然报出。
    expect(findEndpointDrift({
      ...base,
      consumed: [],
      owned: [{ endpoint: 'chatluna-sandbox/x', reason: '合成条目。', owner: '无' }],
    })).toEqual([])
    expect(findEndpointDrift({
      ...base,
      registered: [],
      consumed: [],
      owned: [{ endpoint: 'chatluna-sandbox/x', reason: '合成条目。', owner: '无' }],
    })).toEqual(['chatluna-sandbox/x 在契约里声明了却没有注册监听器'])
  })

  it('每条服务端自用登记都写明理由与负责消化它的后续工作', () => {
    for (const owned of serverOwnedEndpoints) {
      expect(owned.reason.trim(), `${owned.endpoint} 缺少理由`).not.toBe('')
      expect(owned.owner.trim(), `${owned.endpoint} 缺少负责人`).not.toBe('')
    }
  })

  /**
   * 逐条移除登记后对应端点必须重新报错：证明登记表真的在逐端点起作用，
   * 也顺带保证清单里没有已经拿到消费方的陈旧条目。
   */
  it('移除任一登记后对应端点重新报错', async () => {
    const source = readFileSync(resolve(CONTRACT_FILE), 'utf8')
    const declared = readDeclaredEndpoints(source)
    const registered = await collectRegisteredEndpoints()
    const consumed = readClientConsumedEndpoints()
    for (const removed of serverOwnedEndpoints) {
      const owned = serverOwnedEndpoints.filter((entry) => entry !== removed)
      expect(findEndpointDrift({ declared, registered, consumed, owned }), `移除 ${removed.endpoint} 后守卫没有报错`)
        .toEqual([`${removed.endpoint} 没有任何消费方，也没有登记为服务端自用`])
    }
  })
})
