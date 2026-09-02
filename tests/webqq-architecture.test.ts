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

/**
 * 消息能力判据的持有者：`webqq` 模块目录下读取投影的那一个文件。
 *
 * 与端口适配器那条不同，能力判据的合法持有者只有一个，因此这里连目录一起钉住：放宽成
 * 「任何目录下任何叫 message-capabilities.ts 的文件」会让规则靠文件名而不是位置成立，
 * 在别处新建一个同名文件就能绕过它。
 */
const MESSAGE_CAPABILITY_MODULE_PATTERN = /(?:^|\/)webqq\/message-capabilities\.ts$/

/**
 * 「客户端不自己判定消息能力」的谓词。两条分别对应能力谓词的两种命名形状：判定词打头
 * （`canRecallMessage`、`allowReactionFor`）和可行性后缀收尾（`isMessageSelectable`、
 * `isReactionReadonly`、`forkAllowed`）。动作词表就是领域词汇里「消息能力」的那五项。
 *
 * 第二条的 `(?<![-\w])` 是按真实源码校准出来的边界：动作词大小写不敏感才能抓住
 * `forkAllowed` 这类小写打头的拼法，但那样会把 `'is-selectable'` 这个 CSS 类名一起抓进来。
 * 类名是「哪几行看起来可勾选」的呈现绑定而不是能力判定，kebab-case 里动作词前面一定有连字符，
 * 因此排除它；误报会让豁免清单混进假债务。
 */
const messageCapabilityPredicates: readonly ArchitecturePredicate[] = [
  {
    evidence: '出现「判定词 + 消息动作」形式的能力谓词',
    pattern: /\b(?:can|may|allow|permit|forbid|deny|disallow)[A-Za-z]*(?:recall|react|reply|branch|fork|select|forward)/i,
  },
  {
    evidence: '出现「消息动作 + 可行性后缀」形式的能力谓词',
    pattern: /(?<![-\w])[A-Za-z]*(?:recall|reaction|react|reply|branch|fork|select|forward)[A-Za-z]*(?:able|allowed|permitted|readonly|disabled)\b/i,
  },
]

/**
 * 消息动作的发起点：`emit('<动作>', message.id ...)`。
 *
 * 锚点选「动作名 + `message.id`」而不是动作名本身，因此只命中「拿着一条消息向用户提供这个
 * 动作」的位置。聊天区域把表情选择结果转交出去、页面装配转发处理器、外壳发起 RPC，这三处
 * 传的都是 `messageId` 字符串——它们是管道而不是入口，不会被误抓成未守门。
 */
const MESSAGE_ACTION_EMIT_PATTERN = /emit\('([A-Za-z]+)', message\.id/g

/** 读能力位的两种形状：经组件里的读取包装，或直接索引投影。 */
const CAPABILITY_READ_PATTERN = /capabilitiesOf\s*\(|messageCapabilities\s*\[/

/**
 * 裸的错误兜底：「取错误消息，取不到就用一句中文」这个形状。
 *
 * 收拢前它在工作台外壳里出现二十九次，保护的两条不变量（无论成败都复位进行中、每次操作前先清掉
 * 上一次的错误）却一条断言都没有。两者改坏了都不报错——一个表现为界面一直转圈，一个表现为用户
 * 对着一条早已过期的报错发愁——因此这个形状收进闸门与错误位模块，并由本规则拦住下一次照抄。
 *
 * 判定分两步。第一步认「取错误消息」这个头，主语允许是带点的属性路径（`state.error`），两侧必须是
 * 同一个主语（反向引用），因此 `a instanceof Error ? b.message : ...` 这种不同主语的写法不算。
 * 第二步看兜底分支里有没有中文字面量：规则禁止的是把一句中文**写死在条件表达式里**，而把兜底当
 * 参数传进来（`: fallback`）或指向一个具名常量（`: SEARCH_FAILED_TEXT`）恰恰是收拢后的合法形态。
 *
 * 因此本规则不需要按文件名钉持有者：闸门与错误位模块的兜底是参数，在形状上就不违规。这比列举
 * 持有者文件更严——把模块整段抄到别处，抄过去的那份仍然是合法形状，而真正被禁止的照抄一定带着
 * 那句写死的中文。
 */
const ERROR_FALLBACK_HEAD_PATTERN =
  /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s+instanceof\s+Error\s*\?\s*\1\??\.message\s*:/g

/** 中文字面量：单引号、双引号或反引号里含至少一个 CJK 字符。 */
const CJK_LITERAL_PATTERN = /(['"`])[^'"`\n]*[一-鿿][^'"`\n]*\1/

/**
 * 兜底分支的表达式文本：从冒号读到本语句结束。
 *
 * 语句边界按三条判定收：括号配平后遇到 `;`、或遇到换行且下一行不以 `?` / `:` 打头。字符串内部的
 * 分号、括号与换行不算边界，因此含分号的中文文案不会被截断。
 *
 * 三条都是按真实源码校准出来的：续行判定让「把三元链换行摊开」失效——那是最容易想到的绕法；
 * 括号配平让「兜底套在跨行括号里」失效；`;` 截断则防止把同一行后面那条语句里的中文误读成兜底，
 * 误报会让豁免清单混进假债务。
 */
function readFallbackExpression(source: string, index: number): string {
  let depth = 0
  let quote = ''
  let at = index
  for (; at < source.length; at += 1) {
    const character = source[at]!
    if (quote) {
      if (character === '\\') at += 1
      else if (character === quote) quote = ''
      continue
    }
    if (character === '\'' || character === '"' || character === '`') quote = character
    else if ('([{'.includes(character)) depth += 1
    else if (')]}'.includes(character)) depth -= 1
    else if (depth <= 0 && character === ';') break
    else if (depth <= 0 && character === '\n' && !/^\s*[?:]/.test(source.slice(at + 1, source.indexOf('\n', at + 1) + 1 || undefined))) break
  }
  return source.slice(index, at)
}

function findBareErrorFallbacks(_file: string, source: string): string[] {
  const literals = [...source.matchAll(ERROR_FALLBACK_HEAD_PATTERN)]
    .map((match) => readFallbackExpression(source, match.index + match[0].length).match(CJK_LITERAL_PATTERN)?.[0])
    .filter((literal): literal is string => !!literal)
  return literals.length
    ? [`${literals.length} 处裸的错误兜底（${[...new Set(literals)].sort().join(' / ')}）`]
    : []
}

/**
 * 发起点所在的最小作用域：模板里是它所属的那个元素（上一个 `<`），脚本里是它所在的那个函数
 * （上一个 `function ` 或箭头函数体）。取三者中最靠近发起点的那个，因此相邻元素上的守门不会
 * 顺带把本处也算成已守门——少接一个入口仍然是一条绕路，这条规则要逐个入口成立。
 */
function readEnclosingScope(source: string, index: number): string {
  const start = Math.max(
    source.lastIndexOf('<', index),
    source.lastIndexOf('function ', index),
    source.lastIndexOf('=> {', index),
  )
  return source.slice(Math.max(start, 0), index)
}

interface ArchitectureRule {
  readonly name: string
  /**
   * 扫描根目录。提成规则上的字段而不是写死在引擎里：客户端源码规则扫 `client`，
   * 测试断言规则扫 `tests`，两者共用同一份遍历、汇总与豁免机制，不长出第三份引擎。
   */
  readonly root: string
  readonly extensions: readonly string[]
  /** 返回命中的证据描述；空数组表示该文件不违反本规则。 */
  findViolations(file: string, source: string): string[]
}

/**
 * 一级布局区域与工作区本体。ADR 0060：带 `backdrop-filter` 的元素形成 Backdrop Root 边界，
 * 写在这几个选择器上会让工作区内所有控件与覆盖其上的浮层的毛玻璃静默退化成纯半透明。
 */
const FIRST_LEVEL_REGION_PATTERN =
  /\.(?:webqq-workspace|webqq-rail|webqq-conversations|webqq-profile|chatluna-sandbox-chat)(?![\w-])/

/** 吸顶／覆盖式表头。ADR 0071：它们的模糊层必须放在无后代的 `::before` 上。 */
const HEADER_SELECTOR_PATTERN = /header(?![\w-])/i

/**
 * 选择器的主语：最后一个复合选择器。前面的部分只是祖先限定，模糊落在它们身上与否
 * 与本规则无关——`.webqq-workspace.is-frosted .webqq-composer` 的模糊在发送控件上，合法。
 */
function readSelectorSubject(selector: string): string {
  return selector.split(/[\s>~+]+/).filter(Boolean).at(-1) ?? ''
}

/** `::before` / `::after` 是无后代的伪元素层，正是两条决策要求把模糊放进去的地方。 */
function isPseudoElement(compound: string): boolean {
  return compound.includes('::')
}

interface CssRule {
  readonly selectors: string[]
  readonly body: string
}

/**
 * 把 CSS 源码切成「选择器列表 + 声明块」。够用即可：本仓库的样式表没有嵌套规则，
 * `@media` 之类的 at-rule 块会被切成一条选择器为 `@media ...` 的记录，不会命中下面两条谓词。
 *
 * 逗号必须按括号深度切：`:is(.webqq-workspace, .sandbox-popover-content) [data-slot="input"]`
 * 的主语是那个控件而不是工作区，按裸逗号切会把 `:is(.webqq-workspace` 切出来当成一级区域误报。
 */
function splitSelectorList(selectorList: string): string[] {
  const selectors: string[] = []
  let depth = 0
  let current = ''
  for (const character of selectorList) {
    if (character === '(' || character === '[') depth += 1
    else if (character === ')' || character === ']') depth -= 1
    if (character === ',' && depth === 0) {
      selectors.push(current)
      current = ''
      continue
    }
    current += character
  }
  selectors.push(current)
  return selectors.map((selector) => selector.trim()).filter(Boolean)
}

function readCssRules(source: string): CssRule[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selectors: splitSelectorList(match[1]!), body: match[2]! })
  }
  return rules
}

/**
 * 只认真正开启模糊的声明。`backdrop-filter: none` 恰恰是这两条决策要求的写法——雾化态下
 * 关掉遮罩与实体面的模糊——把它判成违规会让规则和它守的决策打架。
 */
function declaresBackdropFilter(body: string): boolean {
  return [...body.matchAll(/(?:^|[\s;])backdrop-filter\s*:([^;}]*)/g)]
    .some((match) => match[1]!.trim() !== 'none')
}

/**
 * 架构守卫自身读取源码是 ADR 0073 明确的第三类例外：「客户端源码是否遵守某条规则」没有别的
 * 观察面。按文件名形状认出来而不是列举文件名，新增守卫文件只要叫 `*-architecture.test.ts`
 * 就自动被认作合法持有者。
 */
const ARCHITECTURE_GUARD_PATTERN = /(?:^|\/)[a-z0-9-]*architecture\.test\.ts$/

/**
 * `const x = <任何含源码路径字面量的表达式>`：把变量名绑到它读进来的那个文件。
 *
 * 按路径字面量而不是按 `readFileSync(` 判定：测试文件普遍会包一层 `readSource(path)` 之类的
 * 小工具，钉住读取函数名会让规则被一个两行的包装函数整体旁路——而那正是规则最需要拦住的写法。
 */
const FILE_READ_PATTERN = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=[^\n]*?'([^']+\.(?:css|vue|ts|mjs|js))'/g

/** `const x = <表达式>`：用于把 `styles.slice(...)`、`(s) => styles.slice(...)` 这类派生变量接上来源。 */
const BINDING_PATTERN = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=([^\n]*(?:\n\s{4,}[^\n]*)*)/g

/**
 * 断言的落点：`expect(<表达式>).toContain(...)` / `.toMatch(...)`。
 *
 * `not\.` 单独成组而不是排除掉——否定式的已删实现守卫是 ADR 0073 的第二类例外，成本结构与
 * 肯定式细节断言相反：它只在有人把删掉的实现加回来时才变红，那正是需要的行为。
 */
const TEXT_ASSERTION_PATTERN = /\bexpect\(([^;]*?)\)\s*\.\s*(not\s*\.\s*)?(toContain|toMatch)\(/g

type TextSource = 'style' | 'source'

/**
 * 判定测试文件里每个字符串变量读的是样式表还是组件源码。
 *
 * 样式文本断言的断言对象本身就是样式源码，它不锁死实现写法，是 ADR 0073 的第一类例外，
 * 因此必须能和组件源码区分开——两者的读取写法一模一样，只有路径后缀不同。
 */
function classifyTextBindings(source: string): Map<string, TextSource> {
  const kinds = new Map<string, TextSource>()
  for (const match of source.matchAll(FILE_READ_PATTERN)) {
    kinds.set(match[1]!, match[2]!.endsWith('.css') ? 'style' : 'source')
  }

  // 派生变量按来源传递：`const chatRule = styles.slice(...)` 仍然是样式文本。
  // 迭代到不动点，因为派生可以套派生。
  const bindings = [...source.matchAll(BINDING_PATTERN)]
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false
    for (const match of bindings) {
      const name = match[1]!
      if (kinds.has(name)) continue
      const referenced = [...match[2]!.matchAll(/[A-Za-z_$][\w$]*/g)]
        .map((identifier) => kinds.get(identifier[0]))
        .filter((kind): kind is TextSource => !!kind)
      if (!referenced.length) continue
      kinds.set(name, referenced.includes('source') ? 'source' : 'style')
      changed = true
    }
    if (!changed) break
  }
  return kinds
}

function findBareSourceAssertions(file: string, source: string): string[] {
  if (ARCHITECTURE_GUARD_PATTERN.test(file)) return []
  const kinds = classifyTextBindings(source)
  const bare = [...source.matchAll(TEXT_ASSERTION_PATTERN)]
    .filter((match) => !match[2])
    .map((match) => match[1]!.match(/[A-Za-z_$][\w$]*/)?.[0])
    .filter((root): root is string => !!root && kinds.get(root) === 'source')
  return bare.length ? [`${bare.length} 条裸的肯定式源码断言（${[...new Set(bare)].sort().join(' / ')}）`] : []
}

/**
 * 规则制而不是白名单制：谓词跑遍客户端全部源码，新增文件默认受约束。
 * 白名单只约束名单内的文件，名单外默认豁免，规则会随文件数增长自动失效。
 */
const rules: readonly ArchitectureRule[] = [
  {
    name: 'UI 模块不读取完整工作区快照',
    root: 'client',
    extensions: ['.vue'],
    findViolations: (_file, source) => fullSnapshotPredicates
      .filter(({ pattern }) => pattern.test(source))
      .map(({ evidence }) => evidence),
  },
  {
    name: '收发 Koishi RPC 的函数只允许出现在客户端端口适配器里',
    root: 'client',
    extensions: ['.ts', '.vue'],
    findViolations: (file, source) => {
      if (PORT_ADAPTER_PATTERN.test(file)) return []
      const calls = [...source.matchAll(/\b(send|receive)\s*\(/g)].map((match) => match[1]!)
      return calls.length ? [`${calls.length} 处 ${[...new Set(calls)].sort().join(' / ')}() 调用绕过端口`] : []
    },
  },
  {
    name: '客户端不自己判定消息能力',
    root: 'client',
    extensions: ['.ts', '.vue'],
    findViolations: (file, source) => {
      if (MESSAGE_CAPABILITY_MODULE_PATTERN.test(file)) return []
      return messageCapabilityPredicates
        .filter(({ pattern }) => pattern.test(source))
        .map(({ evidence }) => evidence)
    },
  },
  {
    name: '消息动作入口必须由能力位守门',
    root: 'client',
    extensions: ['.ts', '.vue'],
    findViolations: (_file, source) => [...source.matchAll(MESSAGE_ACTION_EMIT_PATTERN)]
      .filter((match) => !CAPABILITY_READ_PATTERN.test(readEnclosingScope(source, match.index)))
      .map((match) => `${match[1]!} 入口所在的元素或函数没有读能力位`),
  },
  {
    name: '错误兜底文案不得写死在裸的条件表达式里',
    root: 'client',
    extensions: ['.ts', '.vue'],
    findViolations: findBareErrorFallbacks,
  },
  /**
   * ADR 0060 与 ADR 0071 此前只由消息列表测试里的四条肯定式源码断言守着——它们钉的是
   * `client/webqq-scrollbar.ts` 的源码文本，既不属于消息列表，也管不到别的样式表。
   * 这两条决策的失效形态都是「不会报错、只会静默错」，因此先转成对全仓样式表生效的规则，
   * 再从组件测试里删掉那四条断言。
   */
  {
    name: '工作区本体与一级区域不得声明 backdrop-filter',
    root: 'client/styles',
    extensions: ['.css'],
    findViolations: (_file, source) => readCssRules(source)
      .filter(({ body }) => declaresBackdropFilter(body))
      .flatMap(({ selectors }) => selectors.filter((selector) => {
        const subject = readSelectorSubject(selector)
        return !isPseudoElement(subject) && FIRST_LEVEL_REGION_PATTERN.test(subject)
      }))
      .map((selector) => `${selector} 声明了 backdrop-filter，会成为 Backdrop Root 边界`),
  },
  {
    name: '毛玻璃表头的模糊层必须放在 ::before 上',
    root: 'client/styles',
    extensions: ['.css'],
    findViolations: (_file, source) => readCssRules(source)
      .filter(({ body }) => declaresBackdropFilter(body))
      .flatMap(({ selectors }) => selectors.filter((selector) => {
        const subject = readSelectorSubject(selector)
        return !isPseudoElement(subject) && HEADER_SELECTOR_PATTERN.test(subject)
      }))
      .map((selector) => `${selector} 把模糊写在表头自身上，表头会成为 Backdrop Root 边界`),
  },
  {
    name: '组件测试文件不得出现裸的肯定式源码断言',
    root: 'tests',
    extensions: ['.test.ts'],
    findViolations: findBareSourceAssertions,
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
 * 已消化的文件：组件行为已经下沉成模块，剩下的肯定式断言按五类判据本来就该留——第 3 类
 * （DOM 结构与元素顺序）与第 4 类里的接线与成本结构——但规则无从按形状把它们和被禁止的
 * 实现细节断言区分开，因此仍要登记。**棘轮不数这一组**，否则治理进度永远收敛不到零（ADR 0073）。
 */
const treatedAssertionExemptions: readonly ArchitectureExemption[] = ([
  ['tests/webqq-message-list.test.ts', 'message-chain-behaviour-modules', '消息呈现、思考面板、指针分流、滚动恢复、会话切换、加载更早与时刻格式化七块已下沉'],
  ['tests/webqq-chat-pane.test.ts', 'message-chain-behaviour-modules', '多选、合并转发栈与聊天记录搜索三块已下沉'],
  ['tests/webqq-composer.test.ts', 'composer-draft-host', '草稿宿主、候选菜单与按键路由、附件采集与发送编排四块已下沉'],
  ['tests/model-request-analysis.test.ts', 'analysis-expansion-state', '展开态与原文态十项已下沉，折叠、展开、看原文、搜索命中后的展开与切换记录的复位改由模块的行为断言执行'],
  ['tests/model-request-read-cost.test.ts', 'analysis-expansion-state', '「原文一旦挂载就留着」与「从未切开的消息不进已挂载集合」已下沉成模块断言，这个文件保留它那一半成本断言'],
] as const).map(([file, feature, owner]) => ({
  file,
  rule: '组件测试文件不得出现裸的肯定式源码断言',
  reason: '该文件的组件行为已下沉成模块并由模块的行为断言执行；剩余的肯定式断言是接线、DOM 结构契约或成本结构（五类判据第 3、4 类），规则无从按形状与被禁止的实现细节断言区分。',
  owner: `${feature}（已完成）：${owner}；若日后把接线本身也变成可执行 interface，再收掉这条豁免`,
}))

/**
 * 尚未治理的文件。理由统一：该文件断言的组件行为尚未下沉，这些断言是它当前行为的唯一记录，
 * 在对应 interface 抽出来之前删掉是净损失。负责人分已有架构候选与待开候选两种。
 */
const untreatedAssertionExemptions: readonly ArchitectureExemption[] = ([
  // 多选的六项判定已由 message-chain-behaviour-modules 04 消化；这个文件剩下的是转发目标
  // 对话框，它的页签、搜索与单选行为从未下沉，因此仍是未治理文件。
  ['tests/webqq-message-selection.test.ts', '待开候选：转发目标对话框行为下沉'],
  // 已有架构候选，本轮明确排除在外（见该 feature 的 Out of Scope）。
  ['tests/webqq-preset-workspace.test.ts', '预设工作台候选：源文档与运行时证据关联'],
  // 展开态与原文态下沉（analysis-expansion-state）消化不了这个文件：它断言的是外层模型请求
  // 工作台组件，源码断言里零处涉及那十项状态。因此换成一个真能消化它的候选——留着旧负责人
  // 会让下一轮有人照着做一遍才发现，白花一次。
  ['tests/webqq-model-request-workspace.test.ts', '待开候选：模型请求工作台外壳行为下沉'],
  // 尚无对应候选，登记为待开候选，等有人认领时按同一形状先抽 interface 再删断言。
  ['tests/ai-test-spaces-ui.test.ts', '待开候选：AI 测试空间视图行为下沉'],
  ['tests/environment-components.test.ts', '待开候选：环境管理弹层行为下沉'],
  ['tests/evidence-navigation.test.ts', '待开候选：证据导航视图行为下沉'],
  ['tests/friend-menu.test.ts', '待开候选：关系菜单视图行为下沉'],
  ['tests/group-mention.test.ts', '待开候选：关系菜单视图行为下沉'],
  ['tests/group-menu.test.ts', '待开候选：关系菜单视图行为下沉'],
  ['tests/user-stack.test.ts', '待开候选：用户切换栈视图行为下沉'],
  ['tests/webqq-avatar.test.ts', '待开候选：头像呈现投影下沉'],
  ['tests/webqq-debug-workspace.test.ts', '待开候选：OneBot 调试工作台行为下沉'],
  ['tests/webqq-details-panel.test.ts', '待开候选：详情栏行为下沉'],
  ['tests/webqq-test-call-workspace.test.ts', '待开候选：测试调用工作台行为下沉'],
  ['tests/webqq-page-shell.test.ts', '待开候选：页面外壳装配行为下沉'],
  ['tests/webqq-profile-card.test.ts', '待开候选：资料卡行为下沉'],
  ['tests/webqq-region-css.test.ts', '待开候选：区域类名结构契约转规则制守卫'],
  ['tests/webqq-sidebar.test.ts', '待开候选：侧边栏其余行为下沉'],
  ['tests/sandbox-extension-menu.test.ts', '待开候选：扩展动作登记表的菜单接线下沉'],
] as const).map(([file, owner]) => ({
  file,
  rule: '组件测试文件不得出现裸的肯定式源码断言',
  reason: '该文件断言的组件行为尚未下沉，这些断言是它当前行为的唯一记录；在对应 interface 抽出来之前删除是净损失。',
  owner,
}))

/**
 * 裸错误兜底那条规则的豁免，键是**源码文件**，与上面两组以测试文件为键的条目不是同一批。
 *
 * 工作台外壳那二十九处已经收进闸门与错误位模块；外壳之外还有十处，本轮不迁移。理由不是懒：这些
 * 组件与模块的错误位语义各不相同——有的写进本地状态、有的外发给父级、有的带自己的过期请求判定，
 * 不是一次机械迁移，而且每个都要各自的基线比对。
 */
const errorFallbackExemptions: readonly ArchitectureExemption[] = ([
  ['client/webqq-details-panel.vue', '两处群公告操作的错误写进详情栏本地状态', '待开候选：详情栏行为下沉'],
  ['client/webqq-sidebar.vue', '关系申请处理的错误写进侧栏本地的通知错误位', '待开候选：侧边栏其余行为下沉'],
  ['client/webqq-forward-target-dialog.vue', '多选期间发送控件不可见，错误必须留在本对话框', '待开候选：转发目标对话框行为下沉'],
  ['client/webqq-composer.vue', '切换发送者的错误写进发送控件自己的本地错误位', '待开候选：发送控件其余行为下沉'],
  ['client/preset-workspace.vue', '预设操作的错误经一个本地取消息函数，兜底里还套了一层 String()', '预设工作台候选：源文档与运行时证据关联'],
  ['client/environment-entity-dialog.vue', '环境管理的错误写进弹层本地状态并阻塞关闭', '待开候选：环境管理弹层行为下沉'],
  ['client/environment-create-popover.vue', '新建实体的错误写进浮层本地状态并阻塞关闭', '待开候选：环境管理弹层行为下沉'],
  ['client/webqq/message-search.ts', '同一文件另外两处已改用具名常量，这一处的定位失败仍是字面量；写入前还要过一道过期请求判定', '待开候选：搜索编排的错误位统一'],
  ['client/webqq/composer-send.ts', '发送编排持有自己的进行中与错误位，是发送控件模型的一部分', '待开候选：发送编排改用区域读取闸门'],
] as const).map(([file, reason, owner]) => ({
  file,
  rule: '错误兜底文案不得写死在裸的条件表达式里',
  reason: `${reason}；本轮不迁移，登记为有主的债务。`,
  owner,
}))

/**
 * 已知违规的显式豁免清单，与守卫断言放在同一处，改客户端代码的人立刻看到。
 * 理由与负责人均为必填；豁免不是放行，是有主的债务。
 *
 * 客户端源码那四条规则里，前四条当前一条豁免都没有：九条历史违规已由区域投影下沉与扩展端口两批
 * 工作消化完，消息能力判定在收成共享判据时一并清掉，场景变更广播的模块级 `receive` 在收进工作区
 * 端口时消化。两条毛玻璃规则从一开始就是干净的——它们是从消息列表测试里那四条肯定式断言
 * 转过来的，转的时候实现已经合规。裸错误兜底那条带着九个源码文件的豁免上线，见上一组。
 */
const exemptions: readonly ArchitectureExemption[] = [
  ...treatedAssertionExemptions,
  ...untreatedAssertionExemptions,
  ...errorFallbackExemptions,
]

/**
 * 棘轮只数**未治理**文件，且只减不增。
 *
 * 两条理由。第一，按五类判据，这些文件里三分之二的断言（样式文本、DOM 结构与元素顺序、
 * 用户可见文案）本来就是合法的，钉断言总条数会把「治理完成」误导成「断言归零」，而归零会逼人
 * 删掉有架构决策依据的守卫。第二，已消化的文件不会从豁免清单里消失——它剩下的接线与结构契约
 * 该留，规则却无从按形状区分——把两类混在一个计数里，治理进度永远收敛不到零。
 */
const UNTREATED_FILE_BUDGET = 19

/**
 * 类型声明文件不含运行时代码，`send` 在里面只是被声明的重载签名。
 * 构建产物（`*.generated.css`）不是源码，改它没有意义，规则不扫它。
 */
function listSourceFiles(directory: string, extensions: readonly string[]): string[] {
  return readdirSync(resolve(directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path, extensions)
    if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.generated.css')) return []
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [path] : []
  })
}

function findAllViolations(): string[] {
  return rules.flatMap((rule) => listSourceFiles(rule.root, rule.extensions).flatMap((file) => {
    const source = readFileSync(resolve(file), 'utf8')
    return rule.findViolations(file, source).map((evidence) => `${file} 违反「${rule.name}」：${evidence}`)
  }))
}

function isExempted(violation: string, allowed: readonly ArchitectureExemption[]): boolean {
  return allowed.some(({ file, rule }) => violation.startsWith(`${file} 违反「${rule}」：`))
}

describe('WebQQ 模块化架构', () => {
  it('八条架构规则对各自扫描根目录全量生效，未登记的违规按文件与规则报出', () => {
    expect(findAllViolations().filter((violation) => !isExempted(violation, exemptions))).toEqual([])
  })

  /**
   * 八条规则的谓词自测。这条不依赖豁免清单里有没有条目：客户端那四条规则的清单是空的，
   * 「移除任一豁免必须报错」对它们是空循环，只有喂合成源码才能证明规则还活着。
   */
  it('八条规则各自认得出违规写法，也不误报同名局部变量、呈现绑定与管道', () => {
    const [snapshotRule, rpcRule, capabilityRule, entryRule, fallbackRule] = rules
    const [, , , , , regionFrostRule, headerFrostRule, assertionRule] = rules
    if (!snapshotRule || !rpcRule || !capabilityRule || !entryRule || !fallbackRule) throw new Error('架构规则缺失')
    if (!regionFrostRule || !headerFrostRule || !assertionRule) throw new Error('架构规则缺失')

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

    // 判定词打头与可行性后缀收尾两种形状都要认得，换一种拼法不能让规则静默失效。
    expect(capabilityRule.findViolations('client/x.vue', 'function canRecallMessage(message) {}')).not.toEqual([])
    expect(capabilityRule.findViolations('client/x.vue', 'const allowReactionFor = (message) => !message.event')).not.toEqual([])
    expect(capabilityRule.findViolations('client/x.vue', 'function isMessageSelectable(message) {}')).not.toEqual([])
    expect(capabilityRule.findViolations('client/x.vue', 'const isReactionReadonly = computed(() => true)')).not.toEqual([])
    expect(capabilityRule.findViolations('client/webqq/x.ts', 'const forkAllowed = !message.event')).not.toEqual([])
    // 读取投影的模块是合法持有者；同一段源码换到别处——包括别的目录下的同名文件——仍然违规。
    expect(capabilityRule.findViolations('client/webqq/message-capabilities.ts', 'function canRecallMessage(message) {}')).toEqual([])
    expect(capabilityRule.findViolations('client/webqq/x.ts', 'function canRecallMessage(message) {}')).not.toEqual([])
    expect(capabilityRule.findViolations('client/message-capabilities.ts', 'function canRecallMessage(message) {}')).not.toEqual([])
    // 读能力位、发起动作与呈现绑定都不是判定，不得误报。
    expect(capabilityRule.findViolations('client/x.vue', 'v-if="capabilitiesOf(message).recall"')).toEqual([])
    expect(capabilityRule.findViolations('client/x.vue', "emit('recallMessage', message.id)")).toEqual([])
    expect(capabilityRule.findViolations('client/x.vue', "emit('branchConversationInstance', message.id)")).toEqual([])
    expect(capabilityRule.findViolations('client/x.vue', "{ 'is-selectable': model.selectionMode }")).toEqual([])
    expect(capabilityRule.findViolations('client/x.vue', ':readonly="!capabilitiesOf(message).react"')).toEqual([])

    // 三个写入入口逐个成立：右键项与处理器各自要在自己的元素/函数里读过能力位。
    expect(entryRule.findViolations(
      'client/x.vue',
      '<Item v-if="capabilitiesOf(message).recall" @select="emit(\'recallMessage\', message.id)">',
    )).toEqual([])
    expect(entryRule.findViolations(
      'client/x.vue',
      '<Item @select="emit(\'recallMessage\', message.id)">',
    )).not.toEqual([])
    expect(entryRule.findViolations(
      'client/x.vue',
      'function toggleReaction(message) {\n  if (!capabilitiesOf(message).react) return\n  emit(\'setMessageReaction\', message.id, emojiId, enabled)\n}',
    )).toEqual([])
    expect(entryRule.findViolations(
      'client/x.vue',
      'function toggleReaction(message) {\n  emit(\'setMessageReaction\', message.id, emojiId, enabled)\n}',
    )).not.toEqual([])
    // 相邻元素上的守门不得顺带放行本处：少接一个入口仍然是一条绕路。
    expect(entryRule.findViolations(
      'client/x.vue',
      '<Item v-if="capabilitiesOf(message).react" @select="emit(\'openReactionPicker\', message.id)" />\n<Item @select="emit(\'recallMessage\', message.id)" />',
    )).toEqual(['recallMessage 入口所在的元素或函数没有读能力位'])
    // 聊天区域与外壳传的是 messageId 字符串，那是管道不是入口，不得误报。
    expect(entryRule.findViolations('client/x.vue', "emit('setMessageReaction', messageId, emojiId, true)")).toEqual([])
    expect(entryRule.findViolations('client/webqq/x.ts', 'await port.setMessageReaction({ messageId: input.messageId })')).toEqual([])
    // 打开合并转发与查看资料不是消息能力，不进这条规则。
    expect(entryRule.findViolations('client/x.vue', "emit('openForward', { messageId: message.id, forwardId })")).toEqual([])
    expect(entryRule.findViolations('client/x.vue', "emit('openProfile', message.authorId)")).toEqual([])

    // 裸的错误兜底按形状认：取错误消息，取不到就用一句写死的中文。
    expect(fallbackRule.findViolations('client/webqq/x.ts', "error.value = cause instanceof Error ? cause.message : '发送失败'"))
      .toEqual(["1 处裸的错误兜底（'发送失败'）"])
    expect(fallbackRule.findViolations('client/x.vue', 'errorMessage.value = error instanceof Error ? error.message : "创建失败"'))
      .not.toEqual([])
    // 兜底里套一层 String() 仍然是写死的中文。
    expect(fallbackRule.findViolations('client/x.vue', "return error instanceof Error ? error.message : String(error || '操作失败')"))
      .not.toEqual([])
    // 把同一个三元链换行摊开是最容易想到的绕法，规则要跟着续行读下去。
    expect(fallbackRule.findViolations(
      'client/x.vue',
      'errorMessage.value = error instanceof Error\n  ? error.message\n  : \'创建失败\'',
    )).not.toEqual([])
    // 同一个文件里的多处合并成一条证据，文案去重后列出。
    expect(fallbackRule.findViolations(
      'client/x.vue',
      "a.value = error instanceof Error ? error.message : '发布群公告失败'\nb.value = error instanceof Error ? error.message : '删除群公告失败'",
    )).toEqual(["2 处裸的错误兜底（'删除群公告失败' / '发布群公告失败'）"])
    // 主语是属性路径时同样要认：换成 `state.error` 不能让规则失效。
    expect(fallbackRule.findViolations('client/x.vue', "state.error = cause instanceof Error ? cause.message : '失败了'"))
      .not.toEqual([])
    expect(fallbackRule.findViolations('client/x.vue', "x = state.error instanceof Error ? state.error.message : '失败了'"))
      .not.toEqual([])
    expect(fallbackRule.findViolations('client/x.vue', "x = state.error instanceof Error ? state.error?.message : '失败了'"))
      .not.toEqual([])
    // 兜底套在跨行的括号里也要认。
    expect(fallbackRule.findViolations(
      'client/x.vue',
      'x = cause instanceof Error ? cause.message : (\n  fallback || \'创建失败\'\n)\n',
    )).not.toEqual([])
    // 兜底当参数传进来、或指向具名常量，都是收拢后的合法形态。
    expect(fallbackRule.findViolations('client/webqq/error-slot.ts', 'return cause instanceof Error ? cause.message : fallback')).toEqual([])
    expect(fallbackRule.findViolations('client/webqq/x.ts', 'error.value = failure instanceof Error ? failure.message : SEARCH_FAILED_TEXT')).toEqual([])
    // 规范化非 Error 值的那条三元链里带着 `'string'`、`'message'` 这些非中文字面量，不得误报。
    expect(fallbackRule.findViolations(
      'client/webqq/x.ts',
      "const message = error instanceof Error\n"
      + "  ? error.message\n"
      + "  : typeof error === 'string'\n"
      + "    ? error\n"
      + "    : ''\n"
      + "return message || fallback\n",
    )).toEqual([])
    // 语句结束之后的中文不属于这条兜底，不得越界读进来——换行与同一行的 `;` 两种写法都要收住。
    expect(fallbackRule.findViolations(
      'client/webqq/x.ts',
      'const message = cause instanceof Error ? cause.message : fallback\nconst title = \'读取失败\'\n',
    )).toEqual([])
    expect(fallbackRule.findViolations(
      'client/webqq/x.ts',
      "const message = cause instanceof Error ? cause.message : fallback; const title = '读取失败'\n",
    )).toEqual([])
    // 但文案自己带的分号在字符串内部，不得被当成语句边界而漏报。
    expect(fallbackRule.findViolations(
      'client/webqq/x.ts',
      "const message = cause instanceof Error ? cause.message : '读取失败; 请重试'\n",
    )).not.toEqual([])
    // 经模块表达的写法只有一次调用，没有条件表达式可认。
    expect(fallbackRule.findViolations('client/webqq/x.ts', "await gate.read('list', '读取测试调用记录失败', () => controller.loadTestCallRecords())")).toEqual([])
    expect(fallbackRule.findViolations('client/webqq/x.ts', "await slot.run('撤回失败', () => controller.recallMessage(input))")).toEqual([])
    // 两侧主语不同不是这个形状；取的不是消息也不是。
    expect(fallbackRule.findViolations('client/webqq/x.ts', "const m = cause instanceof Error ? other.message : '失败了'")).toEqual([])
    expect(fallbackRule.findViolations('client/webqq/x.ts', "const m = cause instanceof Error ? cause.stack : '失败了'")).toEqual([])

    // ADR 0060：一级区域自己带模糊就成了 Backdrop Root 边界；模糊挪到 ::before 上则合法。
    expect(regionFrostRule.findViolations('client/styles/x.css', '.webqq-workspace.is-frosted {\n  backdrop-filter: blur(20px);\n}')).not.toEqual([])
    expect(regionFrostRule.findViolations('client/styles/x.css', '.webqq-workspace.is-frosted .webqq-rail {\n  backdrop-filter: blur(20px);\n}')).not.toEqual([])
    expect(regionFrostRule.findViolations('client/styles/x.css', '.webqq-workspace.is-frosted .chatluna-sandbox-chat {\n  backdrop-filter: blur(20px);\n}')).not.toEqual([])
    expect(regionFrostRule.findViolations('client/styles/x.css', '.webqq-workspace.is-frosted .webqq-rail::before {\n  backdrop-filter: blur(20px);\n}')).toEqual([])
    expect(regionFrostRule.findViolations('client/styles/x.css', '.webqq-workspace.is-frosted .webqq-rail {\n  background: rgb(0 0 0 / 20%);\n}')).toEqual([])
    // 显式关掉模糊正是这条决策要的写法，不得反过来被判成违规。
    expect(regionFrostRule.findViolations('client/styles/x.css', '.webqq-workspace {\n  backdrop-filter: none;\n}')).toEqual([])
    // `:is()` 里的逗号不是选择器列表分隔符：这条规则的主语是那个控件，不是工作区。
    expect(regionFrostRule.findViolations(
      'client/styles/x.css',
      ':is(.webqq-workspace, .sandbox-popover-content) [data-slot="input"] {\n  backdrop-filter: blur(20px);\n}',
    )).toEqual([])

    // ADR 0071：表头自身带模糊会挡住它内部 Popover/Select 的毛玻璃，模糊层必须在 ::before 上。
    expect(headerFrostRule.findViolations('client/styles/x.css', '.chatluna-sandbox-chat-header {\n  backdrop-filter: blur(32px);\n}')).not.toEqual([])
    expect(headerFrostRule.findViolations('client/styles/x.css', '.webqq-overlay-header {\n  backdrop-filter: blur(20px);\n}')).not.toEqual([])
    expect(headerFrostRule.findViolations('client/styles/x.css', '.chatluna-sandbox-chat-header::before {\n  backdrop-filter: blur(32px);\n}')).toEqual([])
    // 表头下面的子元素不是表头本身，不得误报。
    expect(headerFrostRule.findViolations('client/styles/x.css', '.chatluna-sandbox-chat-header .webqq-avatar {\n  backdrop-filter: blur(4px);\n}')).toEqual([])

    // 裸的肯定式源码断言按形状认：读的是组件源码、没有 not、用的是文本匹配器。
    const bare = "const source = readFileSync(resolve('client/x.vue'), 'utf8')\nexpect(source).toContain('selectionMode?: boolean')\n"
    expect(assertionRule.findViolations('tests/x.test.ts', bare)).not.toEqual([])
    expect(assertionRule.findViolations('tests/x.test.ts', bare.replace('.toContain', '.toMatch'))).not.toEqual([])
    // 否定式的已删实现守卫是 ADR 0073 的例外，成本结构与肯定式相反，必须放行。
    expect(assertionRule.findViolations('tests/x.test.ts', bare.replace(').toContain', ').not.toContain'))).toEqual([])
    // 用户可见文案经显式辅助函数表达，是规则认得的合法出口。
    expect(assertionRule.findViolations(
      'tests/x.test.ts',
      "const source = readFileSync(resolve('client/x.vue'), 'utf8')\nexpectUserFacingCopy(source, '发送一条消息开始测试')\n",
    )).toEqual([])
    // 读 CSS 文件的样式断言同样是例外，包括从样式变量切出来的规则片段。
    expect(assertionRule.findViolations(
      'tests/x.test.ts',
      "const styles = readFileSync(resolve('client/styles/x.css'), 'utf8')\nexpect(styles).toContain('overflow-anchor: none')\n",
    )).toEqual([])
    // 包一层读取小工具不能让规则失效：变量按它读进来的路径分类，不按读取函数名。
    expect(assertionRule.findViolations(
      'tests/x.test.ts',
      "const source = readSource('client/x.vue')\nexpect(source).toContain('selectionMode?: boolean')\n",
    )).not.toEqual([])
    expect(assertionRule.findViolations(
      'tests/x.test.ts',
      "const styles = readSource('client/styles/x.css')\nexpect(styles).toContain('overflow-anchor: none')\n",
    )).toEqual([])
    expect(assertionRule.findViolations(
      'tests/x.test.ts',
      "const styles = readFileSync(resolve('client/styles/x.css'), 'utf8')\n"
      + "const chatRule = styles.slice(styles.indexOf('.chatluna-sandbox-chat {')).split('}')[0]\n"
      + "expect(chatRule).toContain('grid-template-rows: auto minmax(0, 1fr)')\n",
    )).toEqual([])
    // 从组件源码切出来的片段仍然是源码，换个中间变量不能让规则失效。
    expect(assertionRule.findViolations(
      'tests/x.test.ts',
      "const source = readFileSync(resolve('client/x.vue'), 'utf8')\n"
      + "const menu = source.slice(source.indexOf('<ContextMenu>'))\n"
      + "expect(menu).toContain('<ContextMenuTrigger')\n",
    )).not.toEqual([])
    // 架构守卫读源码是 ADR 0073 的第三类例外：它的断言对象本来就是源码结构。
    expect(assertionRule.findViolations('tests/webqq-architecture.test.ts', bare)).toEqual([])
    expect(assertionRule.findViolations('tests/server-architecture.test.ts', bare)).toEqual([])
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

  /**
   * 棘轮：未治理文件只减不增。数的是文件而不是断言条数——按五类判据，这些文件里三分之二的
   * 断言本来就是合法的，钉总条数会把「治理完成」误导成「断言归零」。已消化的文件单列一组，
   * 不进这个计数，否则进度永远收敛不到零。
   */
  it('未治理文件数只减不增', () => {
    expect(untreatedAssertionExemptions.length).toBeLessThanOrEqual(UNTREATED_FILE_BUDGET)
    // 同一个文件不得在两组里各登记一次，也不得在同一组里重复登记。
    const assertionExemptions = exemptions.filter(({ rule }) => rule === '组件测试文件不得出现裸的肯定式源码断言')
    expect([...new Set(assertionExemptions.map(({ file }) => file))].length).toBe(assertionExemptions.length)
  })

  /**
   * 两批豁免的键不是同一类东西：断言规则那批以**测试文件**为键，裸错误兜底那批以**源码文件**为键。
   * 混进同一组会让「未治理文件只减不增」这个棘轮把源码债务也算进测试治理进度里，两者从此互相掩盖。
   */
  it('以源码文件为键的豁免与以测试文件为键的豁免分开登记', () => {
    expect(errorFallbackExemptions.map(({ file }) => file).filter((file) => !file.startsWith('client/'))).toEqual([])
    expect([...treatedAssertionExemptions, ...untreatedAssertionExemptions]
      .map(({ file }) => file)
      .filter((file) => !file.startsWith('tests/'))).toEqual([])
    expect([...new Set(errorFallbackExemptions.map(({ file }) => file))].length).toBe(errorFallbackExemptions.length)
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
