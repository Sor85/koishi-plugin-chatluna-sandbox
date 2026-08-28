import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 客户端唯一允许发送 Koishi RPC 的文件。 */
const WORKSPACE_PORT_ADAPTER = 'client/webqq/koishi-workspace-port.ts'

/** 区域投影下沉：把完整工作区快照换成区域视图模型。 */
const OWNER_REGION_PROJECTION = '后续工作：区域投影下沉'

/** 扩展工作区端口：把端口覆盖不到的能力补进端口接口。 */
const OWNER_EXTEND_PORT = '后续工作：扩展工作区端口'

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
    name: '发送 Koishi RPC 的函数只允许出现在客户端工作区端口适配器里',
    extensions: ['.ts', '.vue'],
    findViolations: (file, source) => {
      if (file === WORKSPACE_PORT_ADAPTER) return []
      const calls = [...source.matchAll(/\bsend\s*\(/g)]
      return calls.length ? [`${calls.length} 处 send() 调用绕过工作区端口`] : []
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
 */
const exemptions: readonly ArchitectureExemption[] = [
  {
    file: 'client/workspace-thumbnail.vue',
    rule: 'UI 模块不读取完整工作区快照',
    reason: '缩略图按定义要绘制整个工作区，参与者与群组的头像、分布都来自完整快照，没有更小的输入能表达它。',
    owner: OWNER_REGION_PROJECTION,
  },
  {
    file: 'client/ai-test-space-overview.vue',
    rule: 'UI 模块不读取完整工作区快照',
    reason: '总览自己不读快照字段，只是把主环境与各测试空间的快照透传给缩略图；缩略图改吃区域视图模型后这条随之消失。',
    owner: OWNER_REGION_PROJECTION,
  },
  {
    file: 'client/environment-manager.vue',
    rule: 'UI 模块不读取完整工作区快照',
    reason: '环境管理页读参与者与群组做目录展示与计数，它需要的是参与者目录与群组目录这两个区域视图模型，而不是整份快照。',
    owner: OWNER_REGION_PROJECTION,
  },
  {
    file: 'client/page.vue',
    rule: 'UI 模块不读取完整工作区快照',
    reason: '主页面从主环境与测试空间的完整快照派生机器人目录再传给下游区域；派生是控制模块的职责，装配不该做这件事。',
    owner: OWNER_REGION_PROJECTION,
  },
  {
    file: 'client/webqq/test-space-shell.ts',
    rule: '发送 Koishi RPC 的函数只允许出现在客户端工作区端口适配器里',
    reason: '测试空间的列举、创建、接管、归还、终止、重新激活与删除七类能力都不在工作区端口接口里，端口覆盖不全。',
    owner: OWNER_EXTEND_PORT,
  },
  {
    file: 'client/mcp-credential-manager.vue',
    rule: '发送 Koishi RPC 的函数只允许出现在客户端工作区端口适配器里',
    reason: 'MCP 凭证的列举、创建、更新、轮换令牌、启停与吊销都不在工作区端口接口里，端口覆盖不全。',
    owner: OWNER_EXTEND_PORT,
  },
  {
    file: 'client/webqq/mcp-activity-sync.ts',
    rule: '发送 Koishi RPC 的函数只允许出现在客户端工作区端口适配器里',
    reason: 'MCP 活动订阅不在工作区端口接口里，端口覆盖不全；它此前因为守卫不扫描 TypeScript 文件而完全隐形。',
    owner: OWNER_EXTEND_PORT,
  },
  {
    file: 'client/environment-manager.vue',
    rule: '发送 Koishi RPC 的函数只允许出现在客户端工作区端口适配器里',
    reason: 'MCP 能力目录查询不在工作区端口接口里，端口覆盖不全。',
    owner: OWNER_EXTEND_PORT,
  },
  {
    file: 'client/workspace-thumbnail.vue',
    rule: '发送 Koishi RPC 的函数只允许出现在客户端工作区端口适配器里',
    reason: '端口的媒体读取按当前工作区隐式定域，而缩略图要按显式空间读任意测试空间的头像媒体，端口没有这个形状。',
    owner: OWNER_EXTEND_PORT,
  },
]

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

  it('每条豁免都写明理由与负责消化它的后续工作', () => {
    for (const exemption of exemptions) {
      expect(exemption.reason.trim(), `${exemption.file} / ${exemption.rule} 缺少理由`).not.toBe('')
      expect(exemption.owner.trim(), `${exemption.file} / ${exemption.rule} 缺少负责人`).not.toBe('')
      expect([OWNER_REGION_PROJECTION, OWNER_EXTEND_PORT], `${exemption.file} 的负责人不在已知后续工作里`).toContain(exemption.owner)
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
