import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 客户端端口适配器的命名约定。规则按这个形状判定而不是列举文件名：新增适配器只要叫
 * `koishi-<能力>-port.ts` 就自动被认作合法持有者，其余任何文件默认受约束。
 */
const PORT_ADAPTER_PATTERN = /(?:^|\/)koishi-[a-z0-9-]+-port\.ts$/

interface ArchitecturePredicate {
  readonly evidence: string
  readonly pattern: RegExp
}

/**
 * 完整快照规则的谓词。第三条只认属性形式的 `props.snapshot` / `model.snapshot`：
 * 放宽到裸标识符会把聊天区域「把本地搜索条件变量展开进查询参数」的 `...snapshot`
 * 误抓进来，那个变量同名但不是工作区快照，误报会让豁免清单混进假债务。
 */
const fullSnapshotPredicates: readonly ArchitecturePredicate[] = [
  { evidence: '出现完整工作区快照类型名 SandboxSnapshot', pattern: /\bSandboxSnapshot\b/ },
  { evidence: '调用 getSandboxBots / getSandboxUsers 从完整快照派生参与者目录', pattern: /\bgetSandbox(?:Bots|Users)\s*\(/ },
  { evidence: '以 props.snapshot / model.snapshot 形式读取完整快照', pattern: /\b(?:props|model)\.snapshot\b/ },
]

interface ArchitectureRule {
  readonly name: string
  readonly extensions: readonly string[]
  /** 返回命中的证据描述；空数组表示该文件不违反本规则。 */
  findViolations(file: string, source: string): string[]
}

/**
 * 规则制而不是白名单制：谓词跑遍客户端全部源码，新增文件默认受约束。
 * 白名单只约束名单内的文件，名单外默认豁免，规则会随文件数增长自动失效。
 */
const rules: readonly ArchitectureRule[] = [
  {
    name: 'UI 模块不读取完整工作区快照',
    extensions: ['.vue'],
    findViolations: (_file, source) => fullSnapshotPredicates
      .filter(({ pattern }) => pattern.test(source))
      .map(({ evidence }) => evidence),
  },
  {
    name: '收发 Koishi RPC 的函数只允许出现在客户端端口适配器里',
    extensions: ['.ts', '.vue'],
    findViolations: (file, source) => {
      if (PORT_ADAPTER_PATTERN.test(file)) return []
      const calls = [...source.matchAll(/\b(send|receive)\s*\(/g)].map((match) => match[1]!)
      return calls.length ? [`${calls.length} 处 ${[...new Set(calls)].sort().join(' / ')}() 调用绕过端口`] : []
    },
  },
]

interface ArchitectureExemption {
  readonly file: string
  readonly rule: string
  /** 必填：为什么当前允许它违反规则。 */
  readonly reason: string
  /** 必填：负责消化这条债务的后续工作。 */
  readonly owner: string
}

/**
 * 已知违规的显式豁免清单，与守卫断言放在同一处，改客户端代码的人立刻看到。
 * 理由与负责人均为必填；豁免不是放行，是有主的债务。
 *
 * 当前为空：九条历史违规已由区域投影下沉与扩展端口两批工作消化完，两条规则因此是
 * 无例外的不变量。清单与它的三条守卫断言保留，下一次真有取舍时按同一形状登记。
 */
const exemptions: readonly ArchitectureExemption[] = []

/**
 * 类型声明文件不含运行时代码，`send` 在里面只是被声明的重载签名。
 */
function listSourceFiles(directory: string, extensions: readonly string[]): string[] {
  return readdirSync(resolve(directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path, extensions)
    if (entry.name.endsWith('.d.ts')) return []
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [path] : []
  })
}

function findAllViolations(): string[] {
  return rules.flatMap((rule) => listSourceFiles('client', rule.extensions).flatMap((file) => {
    const source = readFileSync(resolve(file), 'utf8')
    return rule.findViolations(file, source).map((evidence) => `${file} 违反「${rule.name}」：${evidence}`)
  }))
}

function isExempted(violation: string, allowed: readonly ArchitectureExemption[]): boolean {
  return allowed.some(({ file, rule }) => violation.startsWith(`${file} 违反「${rule}」：`))
}

describe('WebQQ 模块化架构', () => {
  it('两条架构规则对客户端源码全量生效，未登记的违规按文件与规则报出', () => {
    expect(findAllViolations().filter((violation) => !isExempted(violation, exemptions))).toEqual([])
  })

  /**
   * 两条规则的谓词自测。这条不依赖豁免清单里有没有条目：清单清空后，
   * 「移除任一豁免必须报错」变成空循环，只有喂合成源码才能证明规则还活着。
   */
  it('两条规则各自认得出违规写法，也不误报同名局部变量', () => {
    const [snapshotRule, rpcRule] = rules
    if (!snapshotRule || !rpcRule) throw new Error('架构规则缺失')

    expect(snapshotRule.findViolations('client/x.vue', 'const props = defineProps<{ snapshot: SandboxSnapshot }>()')).not.toEqual([])
    expect(snapshotRule.findViolations('client/x.vue', 'const bots = getSandboxBots(input)')).not.toEqual([])
    expect(snapshotRule.findViolations('client/x.vue', 'const users = getSandboxUsers(input)')).not.toEqual([])
    expect(snapshotRule.findViolations('client/x.vue', 'props.snapshot.participants.length')).not.toEqual([])
    expect(snapshotRule.findViolations('client/x.vue', 'model.snapshot.groups.length')).not.toEqual([])
    // 聊天区域把本地搜索条件变量展开进查询参数，变量同名但不是工作区快照，不得误报。
    expect(snapshotRule.findViolations('client/x.vue', 'await requestSearch({ conversationId, ...snapshot, limit: 30 })')).toEqual([])
    expect(snapshotRule.findViolations('client/x.vue', 'const models = buildWorkspaceThumbnailModels(input)')).toEqual([])

    expect(rpcRule.findViolations('client/x.vue', "await send('chatluna-sandbox/workspace')")).not.toEqual([])
    expect(rpcRule.findViolations('client/webqq/x.ts', "receive('chatluna-sandbox/mcp-activity', handler)")).not.toEqual([])
    expect(rpcRule.findViolations('client/webqq/koishi-x-port.ts', "await send('chatluna-sandbox/workspace')")).toEqual([])
    expect(rpcRule.findViolations('client/webqq/x-port.ts', "await send('chatluna-sandbox/workspace')")).not.toEqual([])
  })

  /**
   * 豁免机制自测。清单为空时下面那条「移除任一豁免」是空循环，只有喂合成数据才能
   * 证明匹配是按文件与规则成对判定的——放宽成只比文件名会让一条豁免掩盖同一文件的另一条规则。
   */
  it('豁免按文件与规则成对匹配，移除后违规重新暴露', () => {
    const snapshotViolation = 'client/x.vue 违反「UI 模块不读取完整工作区快照」：出现完整工作区快照类型名 SandboxSnapshot'
    const rpcViolation = 'client/x.vue 违反「收发 Koishi RPC 的函数只允许出现在客户端端口适配器里」：1 处 send() 调用绕过端口'
    const exemption: ArchitectureExemption = {
      file: 'client/x.vue',
      rule: 'UI 模块不读取完整工作区快照',
      reason: '合成条目，仅用于自测豁免匹配。',
      owner: '无',
    }

    expect(isExempted(snapshotViolation, [exemption])).toBe(true)
    // 同一文件的另一条规则不得被这条豁免顺带放行。
    expect(isExempted(rpcViolation, [exemption])).toBe(false)
    // 同一条规则在另一个文件上也不得被放行。
    expect(isExempted(snapshotViolation.replace('client/x.vue', 'client/y.vue'), [exemption])).toBe(false)
    expect(isExempted(snapshotViolation, [])).toBe(false)
  })

  it('每条豁免都写明理由与负责消化它的后续工作', () => {
    for (const exemption of exemptions) {
      expect(exemption.reason.trim(), `${exemption.file} / ${exemption.rule} 缺少理由`).not.toBe('')
      expect(exemption.owner.trim(), `${exemption.file} / ${exemption.rule} 缺少负责人`).not.toBe('')
    }
  })

  /**
   * 逐条移除豁免后对应文件必须重新报错：证明规则真的在逐文件起作用，
   * 而不是被豁免清单整体旁路，也顺带保证清单里没有已经消化掉的陈旧条目。
   */
  it('移除任一豁免后对应文件重新报错', () => {
    const violations = findAllViolations()
    for (const removed of exemptions) {
      const remaining = exemptions.filter((exemption) => exemption !== removed)
      const exposed = violations.filter((violation) => !isExempted(violation, remaining))
      expect(exposed.length, `移除 ${removed.file} / ${removed.rule} 后规则没有报错`).toBeGreaterThan(0)
      expect([...new Set(exposed.map((violation) => violation.split('：')[0]!))], `${removed.file} / ${removed.rule}`)
        .toEqual([`${removed.file} 违反「${removed.rule}」`])
    }
  })

  it('主页面只负责工作台初始化与区域装配', () => {
    const source = readFileSync(resolve('client/page.vue'), 'utf8')

    expect(source).toContain('createWebqqWorkspaceShell')
    expect(source).not.toMatch(/SandboxSnapshot|ctx\.console|document\./)
    expect(source).not.toContain('async function')
  })

  /**
   * 模板里用到但没导入的图标不会让构建失败，只在运行时打一条
   * 「Failed to resolve component」警告，图标静默消失，因此需要守卫。
   */
  it('模板用到的每个图标都在脚本里导入', () => {
    for (const file of listSourceFiles('client', ['.vue'])) {
      const source = readFileSync(resolve(file), 'utf8')
      const scriptStart = source.indexOf('<script')
      if (scriptStart < 0) continue
      const template = source.slice(0, scriptStart)
      const script = source.slice(scriptStart)
      const used = new Set([
        ...template.matchAll(/<(Icon[A-Za-z0-9]+)/g),
        ...template.matchAll(/:is="(Icon[A-Za-z0-9]+)"/g),
      ].map(match => match[1]!))
      const imported = new Set([...script.matchAll(/\b(Icon[A-Za-z0-9]+)\b/g)].map(match => match[1]!))
      expect([...used].filter(icon => !imported.has(icon)), file).toEqual([])
    }
  })
})
