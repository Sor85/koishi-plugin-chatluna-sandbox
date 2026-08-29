import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 会话解析模块自身是规则的唯一持有者。按形状判定而不是列举文件名：模块换名或拆分后
 * 只要仍叫 `conversation-resolution.ts` 就自动被认作合法持有者，其余服务端源码默认受约束。
 */
const RESOLUTION_MODULE_PATTERN = /(?:^|\/)conversation-resolution\.ts$/

interface ArchitecturePredicate {
  readonly evidence: string
  readonly pattern: RegExp
}

/**
 * 会话集合规则的谓词，按写法形状判定而不是按变量命名。
 *
 * 第一条只认「读或写这个集合」：`.conversations` 后面紧跟方法调用、下标或赋值。放宽到裸
 * `.conversations` 会把「把解析模块投影出来的会话装回快照字段」（`conversations: trimmed.conversations`）
 * 也抓进来，那不是自己查找会话，误报会让豁免清单混进假债务；同时它天然不认领域类型里的
 * 字段声明（`conversations: SandboxConversation[]`），后者是类型定义本身而不是访问。
 *
 * 第二条堵解构旁路：`const { conversations } = scene` 之后的读写不再带 `.conversations` 前缀。
 */
const conversationCollectionPredicates: readonly ArchitecturePredicate[] = [
  { evidence: '直接读写会话集合 .conversations', pattern: /\.conversations\s*(?:\.\s*[A-Za-z]|\[|=[^=])/ },
  { evidence: '解构出会话集合绕过解析模块', pattern: /(?:const|let|var)\s*\{[^}]*\bconversations\b[^}]*\}\s*=/ },
]

interface ArchitectureRule {
  readonly name: string
  readonly extensions: readonly string[]
  /** 返回命中的证据描述；空数组表示该文件不违反本规则。 */
  findViolations(file: string, source: string): string[]
}

/**
 * 规则制而不是白名单制：谓词跑遍服务端全部源码，新增文件默认受约束。
 */
const rules: readonly ArchitectureRule[] = [
  {
    name: '只有会话解析模块能直接读写会话集合',
    extensions: ['.ts'],
    findViolations: (file, source) => {
      if (RESOLUTION_MODULE_PATTERN.test(file)) return []
      return conversationCollectionPredicates
        .filter(({ pattern }) => pattern.test(source))
        .map(({ evidence }) => evidence)
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
 * 已知违规的显式豁免清单，与守卫断言放在同一处，改服务端代码的人立刻看到。
 * 理由与负责人均为必填；豁免不是放行，是有主的债务。
 *
 * 当前为空：全部会话查找都已经收进解析模块，规则因此是无例外的不变量。清单与它的三条
 * 守卫断言保留，下一次真有取舍时按同一形状登记。
 */
const exemptions: readonly ArchitectureExemption[] = []

function listSourceFiles(directory: string, extensions: readonly string[]): string[] {
  return readdirSync(resolve(directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path, extensions)
    if (entry.name.endsWith('.d.ts')) return []
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [path] : []
  })
}

function findAllViolations(): string[] {
  return rules.flatMap((rule) => listSourceFiles('src', rule.extensions).flatMap((file) => {
    const source = readFileSync(resolve(file), 'utf8')
    return rule.findViolations(file, source).map((evidence) => `${file} 违反「${rule.name}」：${evidence}`)
  }))
}

function isExempted(violation: string, allowed: readonly ArchitectureExemption[]): boolean {
  return allowed.some(({ file, rule }) => violation.startsWith(`${file} 违反「${rule}」：`))
}

describe('服务端会话解析架构', () => {
  it('会话集合规则对服务端源码全量生效，未登记的违规按文件与规则报出', () => {
    expect(findAllViolations().filter((violation) => !isExempted(violation, exemptions))).toEqual([])
  })

  it('规则认得出违规写法，也不误报领域类型里的字段声明', () => {
    const [collectionRule] = rules
    if (!collectionRule) throw new Error('架构规则缺失')

    expect(collectionRule.findViolations('src/x.ts', 'scene.conversations.find(({ id }) => id === target)')).not.toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'this.scene.conversations.push(conversation)')).not.toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'snapshot.conversations.map(({ id }) => id)')).not.toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'this.scene.conversations = remaining')).not.toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'const first = scene.conversations[0]')).not.toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'const { conversations } = scene')).not.toEqual([])
    // 领域类型里的字段声明不是读写，不得误报。
    expect(collectionRule.findViolations('src/x.ts', 'interface Scene { conversations: SandboxConversation[] }')).toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'return { revision: 0, conversations: [], messages: [] }')).toEqual([])
    // 把解析模块投影出的会话装回快照字段不是自己查找会话，不得误报。
    expect(collectionRule.findViolations('src/x.ts', 'return { ...scene, conversations: projection.conversations, messages }')).toEqual([])
    // 解析模块自身是规则的持有者。
    expect(collectionRule.findViolations('src/conversation-resolution.ts', 'scene.conversations.find(({ id }) => id === target)')).toEqual([])
  })

  /**
   * 会话解析模块与领域类型一样被客户端一同引用。它一旦 import 'koishi'，整个 Koishi 运行时
   * 就会被打进前端产物（实测 +460 KB）。这类回归不会报错，只会让产物默默变大，因此需要守卫。
   */
  it('被客户端一同引用的领域模块不依赖 Koishi 运行时', () => {
    for (const file of ['src/conversation-resolution.ts', 'src/types.ts']) {
      const source = readFileSync(resolve(file), 'utf8')
      expect([...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!).filter((specifier) => (
        specifier === 'koishi' || specifier.startsWith('koishi/') || specifier.startsWith('@koishijs/')
      )), file).toEqual([])
    }
  })

  it('豁免按文件与规则成对匹配，移除后违规重新暴露', () => {
    const violation = 'src/x.ts 违反「只有会话解析模块能直接读写会话集合」：直接读写会话集合 .conversations'
    const exemption: ArchitectureExemption = {
      file: 'src/x.ts',
      rule: '只有会话解析模块能直接读写会话集合',
      reason: '合成条目，仅用于自测豁免匹配。',
      owner: '无',
    }

    expect(isExempted(violation, [exemption])).toBe(true)
    // 同一条规则在另一个文件上不得被放行。
    expect(isExempted(violation.replace('src/x.ts', 'src/y.ts'), [exemption])).toBe(false)
    expect(isExempted(violation, [])).toBe(false)
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
})
