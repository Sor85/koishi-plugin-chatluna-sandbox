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
 * 会话集合与实例集合规则的谓词，按写法形状判定而不是按变量命名。
 *
 * 每个集合两条：第一条只认「读或写这个集合」，即集合名后面紧跟方法调用、下标或赋值。放宽到裸
 * `.conversations` 会把「把解析模块投影出来的会话装回快照字段」（`conversations: trimmed.conversations`）
 * 也抓进来，那不是自己查找会话，误报会让豁免清单混进假债务；同时它天然不认领域类型里的
 * 字段声明（`conversations: SandboxConversation[]`），后者是类型定义本身而不是访问。
 *
 * 第二条堵解构旁路：`const { conversations } = scene` 之后的读写不再带 `.conversations` 前缀。
 *
 * 两个集合各写一份而不是合成一条带可选后缀的正则：`.conversations` 那条不会命中
 * `.conversationInstances`（集合名后紧跟的是 `Instances` 而不是访问符），因此实例集合不写就是没有守卫。
 */
const conversationCollectionPredicates: readonly ArchitecturePredicate[] = [
  { evidence: '直接读写会话集合 .conversations', pattern: /\.conversations\s*(?:\.\s*[A-Za-z]|\[|=[^=])/ },
  { evidence: '解构出会话集合绕过解析模块', pattern: /(?:const|let|var)\s*\{[^}]*\bconversations\b[^}]*\}\s*=/ },
  { evidence: '直接读写实例集合 .conversationInstances', pattern: /\.conversationInstances\s*(?:\.\s*[A-Za-z]|\[|=[^=])/ },
  { evidence: '解构出实例集合绕过解析模块', pattern: /(?:const|let|var)\s*\{[^}]*\bconversationInstances\b[^}]*\}\s*=/ },
]

/**
 * 记录域目录模块自身是「谁是全部记录域」这条规则的唯一持有者，同样按形状而不是按文件清单判定。
 */
const SCOPE_DIRECTORY_MODULE_PATTERN = /(?:^|\/)scope-directory\.ts$/

/** 按标识取控制服务的全部写法，外加测试控制端点自己那层包装。 */
const CONTROL_LOOKUP_PATTERN = /\b(?:getControl|resolveControl|requireReadable|requireAiControl|requireUserControl)\s*\(/

/**
 * 入站投递模块自身是「入站消息事件字段怎么组装」这条规则的唯一持有者，同样按形状判定。
 */
const INBOUND_DELIVERY_MODULE_PATTERN = /(?:^|\/)inbound-delivery\.ts$/

/**
 * 入站消息事件组装的形状：事件类型与 raw message 出现在**同一个**对象字面量里。
 *
 * 两者分处不同字面量都不算：读取方向那份 `get_msg` 回执带 raw message 但不带事件类型，
 * notice 与 request 那五份带事件类型但不带 raw message，两类都命不中，因此不需要豁免。
 */
const INBOUND_EVENT_TYPE_PATTERN = /\bpost_type\s*:/
const INBOUND_RAW_MESSAGE_PATTERN = /\braw_message\s*:/

/** 去掉嵌套层，只留本层文本，用于判定两个键是不是同一个对象字面量的自有属性。 */
function stripNestedBraces(body: string): string {
  let depth = 0
  let stripped = ''
  for (const char of body) {
    if (char === '{') {
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      continue
    }
    if (depth === 0) stripped += char
  }
  return stripped
}

/** 源码里每个对象字面量的自有属性文本。 */
function objectLiteralOwnLevels(source: string): string[] {
  const levels: string[] = []
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '{') continue
    levels.push(stripNestedBraces(readBalanced(source, index)))
  }
  return levels
}

/** 从开括号处取出与之配对的那一段文本，用于把「清单交给了谁」这段范围切出来。 */
function readBalanced(source: string, openIndex: number): string {
  const open = source[openIndex]!
  const close = open === '(' ? ')' : open === '[' ? ']' : '}'
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === open) depth += 1
    else if (source[index] === close && --depth === 0) return source.slice(openIndex + 1, index)
  }
  return source.slice(openIndex + 1)
}

/**
 * 每处空间清单枚举「把清单交给谁」的那一段文本。
 *
 * 只跟着清单仍在流动的那条路走，因此判定的是写法形状而不是文件里出现过什么：
 * - 清单直接交给某个数组方法的回调时，范围是那对括号；
 * - 清单是 `for…of` 头部的可迭代对象时，范围是紧随其后的循环体。
 *
 * 只匹配成员调用（`X.listSpaces()`），因此清单方法自己的声明不会被当成枚举。清单没有继续
 * 流向任何遍历时（`return this.requireTestSpaces().listSpaces()`）返回空，那只是把清单交给调用方。
 */
function enumerationBodies(source: string): string[] {
  return [...source.matchAll(/\.\s*listSpaces\s*\(\s*\)/g)].flatMap((match) => {
    const after = match.index + match[0].length
    // `?? []`、把清单包起来的右括号与空白都只是转手，清单仍在向后流动。
    const forwarded = /^(?:\s|\)|\?\?|\[|\])*/.exec(source.slice(after))![0]
    const rest = source.slice(after + forwarded.length)
    const chained = /^\.\s*[A-Za-z]+\s*\(/.exec(rest)
    if (chained) return [readBalanced(rest, chained[0].length - 1)]
    return rest.startsWith('{') ? [readBalanced(rest, 0)] : []
  })
}

interface ArchitectureRule {
  readonly name: string
  readonly extensions: readonly string[]
  /** 返回命中的证据描述；空数组表示该文件不违反本规则。 */
  findViolations(file: string, source: string): string[]
}

/**
 * 内置集合与值类型不算协作 module：读自己的集合不是转售。
 */
const OWN_VALUE_TYPE_PATTERN = /^(?:Map|Set|WeakMap|WeakSet|Array|ReadonlyMap|ReadonlySet|ReadonlyArray|Promise|Record|Date|RegExp|Error|Buffer)$/

/**
 * 「哪些私有字段是协作 module 的实例」的两种声明写法：带类型注解的字段（含构造函数参数属性）
 * 与用 `new` 初始化的字段。按声明类型判定而不是按字段名列举，新增一个协作 module 时规则自动覆盖它。
 */
const COLLABORATOR_FIELD_PATTERNS: readonly RegExp[] = [
  /(?:private|protected)\s+(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:\s*([^,)=;\n{]+)/g,
  /(?:private|protected)\s+(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*=\s*new\s+([A-Za-z_$][\w$]*)/g,
]

function collaboratorFields(source: string): Set<string> {
  // 同文件里声明的类不算「另一个 module 的类」：读本 module 自己的内部结构不是转售。
  const sameModule = new Set([...source.matchAll(/(?:^|\n)(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g)].map(([, name]) => name!))
  const fields = new Set<string>()
  for (const pattern of COLLABORATOR_FIELD_PATTERNS) {
    for (const [, field, declared] of source.matchAll(pattern)) {
      const type = declared!.trim()
      // 数组字面量与数组类型都是自己的集合，不是协作 module。
      if (type.endsWith('[]')) continue
      const head = /^[A-Za-z_$][\w$]*/.exec(type)?.[0]
      if (!head || !/^[A-Z]/.test(head) || OWN_VALUE_TYPE_PATTERN.test(head) || sameModule.has(head)) continue
      fields.add(field!)
    }
  }
  return fields
}

interface ClassMemberBody {
  readonly name: string
  readonly body: string
}

/**
 * 公开成员及其成员体。
 *
 * 按仓库的书写约定切块：类成员缩进两空格，成员体要么在同一行内闭合，要么以行末的 `{` 开头、
 * 由一行 `  }` 收尾。构造函数与私有、受保护、静态成员都不在公开成员表里，因此不参与判定。
 */
function publicMemberBodies(source: string): ClassMemberBody[] {
  const lines = source.split('\n')
  const members: ClassMemberBody[] = []
  for (const [index, line] of lines.entries()) {
    const header = /^ {2}((?:public |private |protected |static |readonly |async |get |set )*)([A-Za-z_$][\w$]*)\s*[(<]/.exec(line)
    if (!header || /\b(?:private|protected|static)\b/.test(header[1]!) || header[2] === 'constructor') continue
    const trimmed = line.trimEnd()
    const openIndex = trimmed.endsWith('{') ? trimmed.length - 1 : trimmed.indexOf('{')
    if (openIndex < 0) continue
    const inline = trimmed.slice(openIndex + 1)
    if (inline.includes('}')) {
      members.push({ name: header[2]!, body: inline.slice(0, inline.lastIndexOf('}')) })
      continue
    }
    const end = lines.indexOf('  }', index + 1)
    if (end < 0) continue
    members.push({ name: header[2]!, body: lines.slice(index + 1, end).join('\n') })
  }
  return members
}

/** 成员体是否恰好只有一次 `this.<字段>.<方法>(…)`；`return this.<字段>`（没有调用）不算。 */
function readSingleDelegation(body: string): { field: string, method: string } | undefined {
  const statement = body.replace(/\/\/[^\n]*/g, '').trim().replace(/;$/, '')
  const head = /^(?:return\s+)?this\s*\.\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(statement)
  if (!head) return
  const openIndex = head[0].length - 1
  // 调用括号闭合之后不能再有别的语句，否则「两句都在转售」会被当成一句。
  if (statement.slice(openIndex + readBalanced(statement, openIndex).length + 2).trim()) return
  return { field: head[1]!, method: head[2]! }
}

/**
 * 规则制而不是白名单制：谓词跑遍服务端全部源码，新增文件默认受约束。
 */
const rules: readonly ArchitectureRule[] = [
  {
    name: '只有会话解析模块能直接读写会话集合与实例集合',
    extensions: ['.ts'],
    findViolations: (file, source) => {
      if (RESOLUTION_MODULE_PATTERN.test(file)) return []
      return conversationCollectionPredicates
        .filter(({ pattern }) => pattern.test(source))
        .map(({ evidence }) => evidence)
    },
  },
  {
    name: '只有记录域目录能枚举记录域',
    extensions: ['.ts'],
    findViolations: (file, source) => {
      if (SCOPE_DIRECTORY_MODULE_PATTERN.test(file)) return []
      return enumerationBodies(source)
        .filter((body) => CONTROL_LOOKUP_PATTERN.test(body))
        .map(() => '枚举 AI 测试空间后逐个取控制服务')
    },
  },
  {
    /**
     * 一行转售是 shallow 的定义：interface 和 implementation 一样宽，读它的人多学一个名字却
     * 什么也没少知道。九个替证据记录库说话的成员就是这样攒起来的，规则拦住下一个。
     */
    name: '公开成员不得只转售协作 module',
    extensions: ['.ts'],
    findViolations: (_file, source) => {
      const fields = collaboratorFields(source)
      return publicMemberBodies(source).flatMap(({ name, body }) => {
        const delegation = readSingleDelegation(body)
        if (!delegation || !fields.has(delegation.field)) return []
        return [`公开成员 ${name} 只转售 ${delegation.field}.${delegation.method}(…)`]
      })
    },
  },
  {
    /**
     * 三条发送路径原先各自组装一份几乎相同的投递数据，第四份在机器人适配器里。收进投递模块
     * 之后，规则拦住第五份：给投递加一种能力时三条路自动都有，不会出现只加了一条路的情况。
     */
    name: '只有入站投递模块能组装入站消息事件字段',
    extensions: ['.ts'],
    findViolations: (file, source) => {
      if (INBOUND_DELIVERY_MODULE_PATTERN.test(file)) return []
      // 绝大多数文件里没有 raw message，先短路省掉逐个字面量的扫描。
      if (!INBOUND_RAW_MESSAGE_PATTERN.test(source)) return []
      return objectLiteralOwnLevels(source)
        .filter((level) => INBOUND_EVENT_TYPE_PATTERN.test(level) && INBOUND_RAW_MESSAGE_PATTERN.test(level))
        .map(() => '事件类型与 raw message 出现在同一个对象字面量里')
    },
  },
]

interface ArchitectureExemption {
  readonly file: string
  readonly rule: string
  /**
   * 成员级豁免：只放行这一个成员。省略表示放行该文件下该规则的全部违规。
   *
   * 「公开成员不得只转售协作 module」这条要的就是成员级粒度：它的两处豁免同在一个文件里，
   * 沿用文件级匹配会让同文件长出第三个转售成员被静默放过。
   */
  readonly member?: string
  /** 必填：为什么当前允许它违反规则。 */
  readonly reason: string
  /** 必填：负责消化这条债务的后续工作。 */
  readonly owner: string
}

/**
 * 已知违规的显式豁免清单，与守卫断言放在同一处，改服务端代码的人立刻看到。
 * 理由与负责人均为必填；豁免不是放行，是有主的债务。
 *
 * 四条规则里三条当前无例外：全部会话查找都已经收进解析模块，全部记录域枚举都已经收进记录域
 * 目录，入站消息事件组装只剩投递模块那一处。转售那条留下两处，都在同一个文件里，因此按成员
 * 登记——同一文件长出第三个转售成员仍要报出。
 */
const exemptions: readonly ArchitectureExemption[] = [
  {
    file: 'src/control-service.ts',
    rule: '公开成员不得只转售协作 module',
    member: 'getChatLunaStates',
    reason: 'ChatLuna 对话状态库尚未决定归属：它不是证据记录，读取方是工作区状态投影而不是记录页，与本轮收拢的两个记录库不同源。就地把状态库交出去会让工作区投影直接依赖 ChatLuna 事件模型，代价大于这一个键。',
    owner: '后续候选「ChatLuna 状态库的归属」：先判定状态库该由谁持有，再一并收掉这两个成员。',
  },
  {
    file: 'src/control-service.ts',
    rule: '公开成员不得只转售协作 module',
    member: 'recordChatLunaModelRequest',
    reason: '与 getChatLunaStates 同源：写入侧的这一句同样只是替 ChatLuna 状态库转述，两者要在同一次判定里一起处理，单独收掉写入侧会让读写两侧的持有者不一致。',
    owner: '后续候选「ChatLuna 状态库的归属」：先判定状态库该由谁持有，再一并收掉这两个成员。',
  },
]

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
  return allowed.some(({ file, rule, member }) => (
    violation.startsWith(`${file} 违反「${rule}」：`)
    // 登记了成员就只放行那一个成员；同一文件同一规则下的别的成员仍要报出。
    && (!member || violation.includes(`成员 ${member} `))
  ))
}

describe('服务端架构守卫', () => {
  it('四条规则对服务端源码全量生效，未登记的违规按文件、规则与成员报出', () => {
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
    // 实例集合与会话集合同规则：`.conversations` 那条正则命不中它，必须各自成条。
    expect(collectionRule.findViolations('src/x.ts', 'scene.conversationInstances.filter(({ id }) => id !== target)')).not.toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'snapshot.conversationInstances = []')).not.toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'const { conversationInstances } = scene')).not.toEqual([])
    // 领域类型里的字段声明不是读写，不得误报。
    expect(collectionRule.findViolations('src/x.ts', 'interface Scene { conversations: SandboxConversation[] }')).toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'return { revision: 0, conversations: [], messages: [] }')).toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'return { revision: 0, conversationInstances: [], messages: [] }')).toEqual([])
    // 把解析模块投影出的会话装回快照字段不是自己查找会话，不得误报。
    expect(collectionRule.findViolations('src/x.ts', 'return { ...scene, conversations: projection.conversations, messages }')).toEqual([])
    expect(collectionRule.findViolations('src/x.ts', 'return { ...scene, conversationInstances: projection.conversationInstances }')).toEqual([])
    // 解析模块自身是规则的持有者。
    expect(collectionRule.findViolations('src/conversation-resolution.ts', 'scene.conversations.find(({ id }) => id === target)')).toEqual([])
    expect(collectionRule.findViolations('src/conversation-resolution.ts', 'scene.conversationInstances = rows')).toEqual([])
  })

  it('记录域规则认得出「枚举后逐个取控制服务」，也不误报纯列清单与单空间解析', () => {
    const scopeRule = rules.find(({ name }) => name === '只有记录域目录能枚举记录域')
    if (!scopeRule) throw new Error('记录域架构规则缺失')

    // 链式遍历与 for…of 两种写法，以及测试控制端点自己那层包装，都是同一件事。
    expect(scopeRule.findViolations('src/x.ts', 'testSpaces.listSpaces().map((space) => testSpaces.getControl(space.id))')).not.toEqual([])
    expect(scopeRule.findViolations('src/x.ts', '...(testSpaces?.listSpaces() ?? []).map((space) => testSpaces!.getControl(space.id)\n  .getModelRequestStore().getRecords(query))')).not.toEqual([])
    expect(scopeRule.findViolations('src/x.ts', 'for (const space of testSpaces?.listSpaces() ?? []) {\n  cleared += await testSpaces!.getControl(space.id).getOneBotDebugStore().clear()\n}')).not.toEqual([])
    expect(scopeRule.findViolations('src/x.ts', '...(this.testSpaces?.listSpaces() ?? []).map((space) => this.resolveControl({ spaceId: space.id }, false).getModelRequestStore().getRecords(query))')).not.toEqual([])
    // 纯粹把清单列给用户或外部测试控制器看：只取清单，不取控制服务。
    expect(scopeRule.findViolations('src/x.ts', "registerListener('test-spaces', () => testSpaces.listSpaces()\n  .map((space) => ({ ...space, snapshot: trimSnapshotMessages(space.snapshot, 10) })), { authority: 4 })\nconst spaceControl = testSpaces.getControl(input.spaceId)")).toEqual([])
    expect(scopeRule.findViolations('src/x.ts', "if (tool === 'list_test_spaces') return this.requireTestSpaces().listSpaces()\nreturn this.requireTestSpaces().getControl(args.spaceId)")).toEqual([])
    // 带显式空间标识的单空间解析不枚举，不该命中。
    expect(scopeRule.findViolations('src/x.ts', 'const space = testSpaces.getSpace(input.spaceId)\nconst spaceControl = testSpaces.getControl(space.id)')).toEqual([])
    // 清单方法自身的声明不是枚举，不得把方法体当成使用点。
    expect(scopeRule.findViolations('src/x.ts', 'listSpaces(): SandboxTestSpaceSummary[] {\n  return [...this.spaces.values()].map((space) => this.getControl(space.id))\n}')).toEqual([])
    // 记录域目录自身是规则的持有者。
    expect(scopeRule.findViolations('src/scope-directory.ts', 'testSpaces.listSpaces().map(({ id }) => testSpaces.getControl(id))')).toEqual([])
  })

  it('转售规则认得出一行委托，也不误报读自己集合、裸字段返回、自由函数与记录库自身', () => {
    const resellRule = rules.find(({ name }) => name === '公开成员不得只转售协作 module')
    if (!resellRule) throw new Error('转售架构规则缺失')

    /** 三个字段各代表一类：协作 module、内置集合、数组字面量。 */
    const thing = (...members: string[]) => [
      "import { SandboxModelRequestStore } from './model-request'",
      '',
      'export class Thing {',
      '  private records: SandboxModelRequestStore',
      '  private rows = new Map<string, string>()',
      '  private names: SandboxName[] = []',
      '',
      ...members,
      '}',
      '',
    ].join('\n')

    // 带返回值、不带返回值与 async 三种形态都是同一件事。
    expect(resellRule.findViolations('src/x.ts', thing(
      '  getRecords(input: Query): Promise<Page> {',
      '    return this.records.getRecords(input)',
      '  }',
    ))).toEqual(['公开成员 getRecords 只转售 records.getRecords(…)'])
    expect(resellRule.findViolations('src/x.ts', thing(
      '  trackUpdate(task: Promise<void>): void {',
      '    this.records.trackUpdate(task)',
      '  }',
    ))).toEqual(['公开成员 trackUpdate 只转售 records.trackUpdate(…)'])
    expect(resellRule.findViolations('src/x.ts', thing(
      '  async clearRecords(): Promise<number> {',
      '    return this.records.clear()',
      '  }',
    ))).toEqual(['公开成员 clearRecords 只转售 records.clear(…)'])
    // 参数跨行不改变「只有一句」这个事实。
    expect(resellRule.findViolations('src/x.ts', thing(
      '  requireRecord(recordId: string, includeLargeValues: boolean) {',
      '    return this.records.requireRecord(',
      '      recordId,',
      '      includeLargeValues,',
      '    )',
      '  }',
    ))).toEqual(['公开成员 requireRecord 只转售 records.requireRecord(…)'])

    // 读自己的集合不是转售。
    expect(resellRule.findViolations('src/x.ts', thing(
      '  listRows(): string[] {',
      '    return this.rows.get(key)',
      '  }',
      '',
      '  listNames(): SandboxName[] {',
      '    return this.names.map(toName)',
      '  }',
    ))).toEqual([])
    // 把记录库整个交出去正是本规则想要的结果，没有调用就不是转售。
    expect(resellRule.findViolations('src/x.ts', thing(
      '  getModelRequestStore(): SandboxModelRequestStore {',
      '    return this.records',
      '  }',
    ))).toEqual([])
    // 只有一句但调用的是自由函数：这一句是本 module 自己的判断。
    expect(resellRule.findViolations('src/x.ts', thing(
      '  describe(input: Query): string {',
      '    return describeQuery(this.records, input)',
      '  }',
    ))).toEqual([])
    // 私有成员不在公开成员表里。
    expect(resellRule.findViolations('src/x.ts', thing(
      '  private forward(input: Query) {',
      '    return this.records.getRecords(input)',
      '  }',
    ))).toEqual([])
    // 两句都在转售时不能被当成一句放过。
    expect(resellRule.findViolations('src/x.ts', thing(
      '  clearBoth(): void {',
      '    this.records.clear()',
      '    this.records.trackUpdate(task)',
      '  }',
    ))).toEqual([])

    // 同 module 内声明的类不是「另一个 module 的类」：读本 module 自己的内部结构不是转售。
    expect(resellRule.findViolations('src/record-store.ts', [
      'export class ScopeRowIndex {',
      '  summary(): Summary {',
      '    return { recordCount: 0 }',
      '  }',
      '}',
      '',
      'export class InMemoryRecordRows {',
      '  private index = new ScopeRowIndex()',
      '',
      '  async summarize(): Promise<Summary> {',
      '    return this.index.summary()',
      '  }',
      '}',
      '',
    ].join('\n'))).toEqual([])

    // 记录库自身：读取要先等落盘再问持久化，是多句；落盘等待的那一句委托是私有的。
    expect(resellRule.findViolations('src/onebot-debug.ts', [
      "import { SerialWriteQueue } from './record-store'",
      '',
      'export class SandboxOneBotDebugStore {',
      '  private persistence: SandboxOneBotDebugPersistence',
      '  private readonly writes: SerialWriteQueue',
      '',
      '  waitForPersistence(): Promise<void> {',
      '    return this.settle()',
      '  }',
      '',
      '  async getRecord(recordId: string): Promise<Record | undefined> {',
      '    await this.settle()',
      '    return this.persistence.find(recordId)',
      '  }',
      '',
      '  private settle(): Promise<void> {',
      '    return this.writes.settle()',
      '  }',
      '}',
      '',
    ].join('\n'))).toEqual([])
  })

  it('入站消息事件规则认得出同一字面量里的事件类型与 raw message，也不误报读取方向与通知那两族', () => {
    const rule = rules.find(({ name }) => name === '只有入站投递模块能组装入站消息事件字段')
    if (!rule) throw new Error('入站投递架构规则缺失')

    // 沙盒挂在会话上的原始载荷就是这个形状，嵌一层也照样认得出。
    expect(rule.findViolations('src/x.ts', [
      'Object.assign(session, {',
      '  onebot: {',
      "    post_type: 'message',",
      "    message_type: 'private',",
      '    message: segments,',
      '    raw_message: rawMessage,',
      '  },',
      '})',
    ].join('\n'))).toEqual(['事件类型与 raw message 出现在同一个对象字面量里'])

    // 读取方向那份带 raw message 但不带事件类型，是 get_msg 的回执而不是一次入站事件。
    expect(rule.findViolations('src/x.ts', [
      'return {',
      "  message_type: conversation?.type === 'group' ? 'group' : 'private',",
      '  message: onebotMessage,',
      '  raw_message: toOneBotRawMessage(onebotMessage),',
      '}',
    ].join('\n'))).toEqual([])

    // notice 与 request 那五份带事件类型但不带 raw message，组装留在控制服务是本轮的决定。
    expect(rule.findViolations('src/x.ts', [
      'Object.assign(session, {',
      '  onebot: {',
      "    post_type: 'notice',",
      '    notice_type: noticeType,',
      '    ...noticeData,',
      '  },',
      '})',
    ].join('\n'))).toEqual([])

    // 两者分处不同字面量不是一次组装，不得合报。
    expect(rule.findViolations('src/x.ts', [
      "const head = { post_type: 'message' }",
      'const body = { raw_message: rawMessage }',
    ].join('\n'))).toEqual([])

    // 投递模块自身是规则的持有者。
    expect(rule.findViolations('src/inbound-delivery.ts', "{ post_type: 'message', raw_message: rawMessage }")).toEqual([])
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

  it('未登记成员的豁免按文件与规则成对匹配，移除后违规重新暴露', () => {
    const violation = 'src/x.ts 违反「只有会话解析模块能直接读写会话集合与实例集合」：直接读写会话集合 .conversations'
    const exemption: ArchitectureExemption = {
      file: 'src/x.ts',
      rule: '只有会话解析模块能直接读写会话集合与实例集合',
      reason: '合成条目，仅用于自测豁免匹配。',
      owner: '无',
    }

    expect(isExempted(violation, [exemption])).toBe(true)
    // 同一条规则在另一个文件上不得被放行。
    expect(isExempted(violation.replace('src/x.ts', 'src/y.ts'), [exemption])).toBe(false)
    expect(isExempted(violation, [])).toBe(false)
  })

  /**
   * 转售规则的两处豁免同在一个文件里。文件级匹配会让同文件长出第三个转售成员被静默放过，
   * 因此登记了成员的豁免必须只放行那一个成员。
   */
  it('登记了成员的豁免只放行那一个成员，同文件同规则的别的成员仍然报出', () => {
    const rule = '公开成员不得只转售协作 module'
    const exempted = `src/control-service.ts 违反「${rule}」：公开成员 getChatLunaStates 只转售 chatLunaState.getStates(…)`
    const another = `src/control-service.ts 违反「${rule}」：公开成员 getMediaLabel 只转售 mediaStorage.describe(…)`
    const exemption: ArchitectureExemption = {
      file: 'src/control-service.ts',
      rule,
      member: 'getChatLunaStates',
      reason: '合成条目，仅用于自测成员级豁免匹配。',
      owner: '无',
    }

    expect(isExempted(exempted, [exemption])).toBe(true)
    expect(isExempted(another, [exemption])).toBe(false)
    // 成员名相同但文件不同时同样不得放行。
    expect(isExempted(exempted.replace('src/control-service.ts', 'src/y.ts'), [exemption])).toBe(false)
  })

  it('每条豁免都写明理由与负责消化它的后续工作', () => {
    for (const exemption of exemptions) {
      expect(exemption.reason.trim(), `${exemption.file} / ${exemption.rule} 缺少理由`).not.toBe('')
      expect(exemption.owner.trim(), `${exemption.file} / ${exemption.rule} 缺少负责人`).not.toBe('')
      // 占位文字不算理由。
      expect(exemption.reason, `${exemption.file} / ${exemption.rule} 的理由是占位文字`).not.toMatch(/^(?:TODO|待补|暂时|无)/)
      expect(exemption.owner, `${exemption.file} / ${exemption.rule} 的负责人是占位文字`).not.toMatch(/^(?:TODO|待补|暂时|无)$/)
    }
  })

  /**
   * 逐条移除豁免后对应文件必须重新报错：证明规则真的在逐文件起作用，
   * 而不是被豁免清单整体旁路，也顺带保证清单里没有已经消化掉的陈旧条目。
   * 成员级豁免同样如此：移除它只应暴露它自己那一个成员。
   */
  it('移除任一豁免后对应文件重新报错', () => {
    const violations = findAllViolations()
    for (const removed of exemptions) {
      const remaining = exemptions.filter((exemption) => exemption !== removed)
      const exposed = violations.filter((violation) => !isExempted(violation, remaining))
      expect(exposed.length, `移除 ${removed.file} / ${removed.rule} 后规则没有报错`).toBeGreaterThan(0)
      expect([...new Set(exposed.map((violation) => violation.split('：')[0]!))], `${removed.file} / ${removed.rule}`)
        .toEqual([`${removed.file} 违反「${removed.rule}」`])
      if (removed.member) {
        expect(exposed, `移除 ${removed.file} / ${removed.member} 后暴露的不只是它自己`)
          .toEqual([expect.stringContaining(`成员 ${removed.member} `)])
      }
    }
  })
})
