import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { listClientStylesheets, readClientStyleBlocks } from './helpers/client-stylesheets'

/**
 * 本插件样式表面的外边界：声明只能落在自己的根节点上，不能落到宿主控制台的根节点上（ADR-0097）。
 *
 * 这条边界值得守而不只是写在文档里，因为越界的代价不由本插件承担：控制台把所有插件的客户端样式
 * 打进同一张表，插件写到 html / body / #app 上的声明会同时作用在别人的页面上。本插件页面自己
 * 取 100vh，越界之后照样正常，自查看不出任何异常——报错在别人那边，还是「打开是一片白」这种
 * 不带线索的形态。
 */

/** 宿主根节点：这三个不属于本插件的表面，控制台和其余插件的页面都站在它们上面。 */
const HOST_ROOTS = ['html', 'body', '#app']

/** 全部样式源码：独立样式表 + 单文件组件里的 style 块。产物表不是源码，排除。 */
function styleSources(): { path: string, source: string }[] {
  return [
    ...listClientStylesheets()
      .filter((path) => !path.includes('generated'))
      .map((path) => ({ path, source: readFileSync(resolve(path), 'utf8') })),
    ...readClientStyleBlocks(),
  ]
}

/** 按顶层分隔符切开，括号里的逗号与空格属于 `:is()`/`:has()` 的内部结构，不参与切分。 */
function splitTopLevel(text: string, separators: RegExp): string[] {
  const parts: string[] = ['']
  let depth = 0
  for (const char of text) {
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (depth === 0 && separators.test(char)) {
      parts.push('')
      continue
    }
    parts[parts.length - 1] += char
  }
  return parts.map((part) => part.trim()).filter(Boolean)
}

/**
 * 选择器的主体，也就是声明真正落在谁身上：最后一个复合选择器。
 *
 * 判定必须落在主体而不是「出现过 body 吗」：`body[data-…] .chatluna-sandbox-page` 只是拿 body 当
 * 限定条件，声明落在本插件的页面根上，是允许的形态；`body { … }` 才是往宿主身上写。
 */
function subjectOf(selector: string): string {
  return splitTopLevel(selector, /[\s>+~]/).pop() ?? ''
}

/** 剥掉属性与伪类，只留元素名或 id：`body[data-x]:has(.y)` 与 `body` 一样都是往 body 上写。 */
function bareSubject(selector: string): string {
  return subjectOf(selector)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/::?[a-z-]+(\([^)]*\))?/g, '')
}

/** 源码里的全部选择器。at-rule 的前奏与声明块内容都不是选择器，按 `@` 和 `;` 排除。 */
function selectorsOf(source: string): string[] {
  return [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|[{}])([^{}]*)\{/g)]
    .flatMap((match) => splitTopLevel(match[1]!.trim(), /,/))
    .filter((selector) => selector && !selector.startsWith('@') && !selector.includes(';'))
}

describe('宿主样式表面', () => {
  /**
   * 控制台自己的 `body { min-height: 100vh }` 是同一个控制台里所有插件页面共用的高度地基。插件写一条
   * 同名声明就会盖掉它（同特异性，后加载者胜），而 `min-height: 100%` 的百分比要拿 auto 高度的 html
   * 求值、退化成 auto，body 与 #app 一起塌成 0 高度。本插件页面取 100vh 察觉不到，但别人页面凡是靠
   * `position: absolute; inset: 0` 或百分比高度撑开根容器，就会拿到 0 高度并被 overflow: hidden 裁空
   * ——表现是「另一个插件的页面打开是一片白」，不报错也没有任何线索指回这里。
   */
  it('不往宿主根节点写声明，body 只当限定条件用', () => {
    const offenders: string[] = []
    for (const { path, source } of styleSources()) {
      for (const selector of selectorsOf(source)) {
        if (HOST_ROOTS.includes(bareSubject(selector))) offenders.push(`${path}: ${selector}`)
      }
    }
    expect(offenders, 'html / body / #app 属于宿主表面，本插件的尺寸与外观只能写在自己的根节点上').toEqual([])
  })

  /**
   * `:global()` 在 scoped 块里只能整条用。@vue/compiler-sfc 命中它时会把整条选择器替换成括号里的
   * 第一段，`:global(.dark) .sandbox-badge` 编译出来是裸的 `.dark { … }`：一边漏成全局规则去染控制台里
   * 任何带该类名的元素，一边把真正想选中的那一段整段丢掉，于是「样式没生效」和「污染了别人」同时发生。
   * 本仓库不需要这个能力——Portal 浮层的样式走 `client/styles/webqq-primitives.css` 这类无作用域表。
   */
  it('组件的 scoped 块不用 :global()', () => {
    // 注释先去掉：这条规则的由来就写在 Badge.vue 的注释里，扫原文会把说明本身当成违规。
    const offenders = readClientStyleBlocks()
      .filter(({ source }) => source.replace(/\/\*[\s\S]*?\*\//g, '').includes(':global('))
      .map(({ path }) => path)
    expect(offenders, ':global() 会被整条替换成括号内的第一段；暗色钩子请写 [data-color-mode] 或 body 属性').toEqual([])
  })
})
