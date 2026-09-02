import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `webqq-` 顶层块的冻结清单。终态是一套命名空间（ADR-0091），因此这份清单只允许删行：
 * 新增顶层块必须写 `chatluna-sandbox-`，把既有块改名过去时从这里删掉对应行。
 *
 * 冻结的粒度是**类名第一段**而不是完整类名。这样给既有块补子元素
 * （`webqq-composer` 下新增 `webqq-composer-quote`）不受影响——那是维护既有区域，
 * 不是新开一套命名；而新开一个块（`webqq-brandnew`）会立刻红灯。
 */
const FROZEN_WEBQQ_BLOCKS = [
  'agent',
  'announcement',
  'avatar',
  'brand',
  'capability',
  'chatluna',
  'composer',
  'conversations',
  'debug',
  'empty',
  'entity',
  'environment',
  'form',
  'group',
  'history',
  'icon',
  'identity',
  'info',
  'menu',
  'model',
  'notification',
  'notifications',
  'online',
  'overlay',
  'preset',
  'private',
  'profile',
  'rail',
  'relation',
  'role',
  'secondary',
  'section',
  'session',
  'sidebar',
  'space',
  'test',
  'user',
  'welcome',
  'workspace',
]

/**
 * `sandbox-` 只属于 shadcn-vue 封装：类名写死在 `client/components/ui/` 里，
 * 其中四个还是 Portal 内容根（见 `scripts/sandbox-style-roots.mjs`）。
 * 唯一登记的历史例外是 AI 控制图标那一族，它不是封装却用了这个前缀。
 */
const SANDBOX_PREFIX_EXCEPTIONS = ['sandbox-agent-control']

function listFiles(directory: string, test: RegExp): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path, test) : test.test(entry.name) ? [path] : []
  })
}

/** 样式表是唯一的判定面：模板里写了但没有任何规则选中的类名不产生视觉，也不构成命名空间。 */
function readStyleSheets(): string[] {
  return readdirSync(resolve('client/styles'))
    .filter((name) => name.endsWith('.css') && name !== 'tailwind.generated.css')
    .map((name) => readFileSync(resolve('client/styles', name), 'utf8'))
}

function collectBlocks(prefix: string): string[] {
  const blocks = new Set<string>()
  for (const source of readStyleSheets()) {
    for (const match of source.matchAll(new RegExp(`\\.${prefix}-([a-z0-9]+)`, 'g'))) blocks.add(match[1]!)
  }
  return [...blocks].sort()
}

describe('CSS 命名空间', () => {
  it('webqq- 的顶层块只减不增', () => {
    expect(collectBlocks('webqq')).toEqual([...FROZEN_WEBQQ_BLOCKS].sort())
  })

  /**
   * 反向断言：新命名空间必须真的在用，否则「新增写 chatluna-sandbox-」只是一句没有
   * 执行力的规定。它同时钉住页面根与 Portal 根归这一套（`sandbox-style-roots` 那条
   * 断言的是清单与令牌选择器一致，不管前缀归属）。
   */
  it('chatluna-sandbox- 是页面根与浮层根所用的那一套', () => {
    const blocks = collectBlocks('chatluna-sandbox')

    expect(blocks).toContain('page')
    expect(blocks).toContain('layout')
    expect(blocks.length).toBeGreaterThan(15)
  })

  /**
   * 判定面是样式表里的声明，不是模板里的书写：`sandbox-` 这一套的意义在于「它属于
   * shadcn-vue 封装」，而封装的类名写死在组件里。改成扫模板会把 `closest('.sandbox-select-content')`
   * 这类对封装类名的读取、以及 `sandbox-media-*` 这类同名的媒体标识误判成违规。
   */
  it('sandbox- 只用于 shadcn-vue 封装写死的类名', () => {
    const wrapperSource = listFiles(resolve('client/components/ui'), /\.(vue|ts)$/)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')

    const declared = new Set<string>()
    for (const source of readStyleSheets()) {
      for (const match of source.matchAll(/\.(sandbox-[a-z0-9-]+)/g)) declared.add(match[1]!)
    }

    const orphans = [...declared]
      .filter((name) => !wrapperSource.includes(name))
      .filter((name) => !SANDBOX_PREFIX_EXCEPTIONS.some((prefix) => name.startsWith(prefix)))
      .sort()

    expect(orphans).toEqual([])
  })
})
