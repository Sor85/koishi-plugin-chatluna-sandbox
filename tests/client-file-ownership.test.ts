import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * client/ 根目录允许存在的东西：控制台入口，以及作用于整棵树的全局声明与样式入口。
 * 除此之外每个客户端文件都必须落在一个能力目录里（ADR-0090）。
 */
const ALLOWED_ROOT_FILES = ['index.ts', 'shims.d.ts', 'koishi-client-shim.d.ts', 'style.css']

/** 能力目录，加上不按能力划分的三个既有目录：共享原语、shadcn 封装、样式表。 */
const ALLOWED_DIRECTORIES = [
  'environment',
  'mcp',
  'model-request',
  'onebot-debug',
  'preset',
  'test-call',
  'test-space',
  'webqq',
  'workspace',
  'shared',
  'components',
  'lib',
  'styles',
]

function readClientRoot() {
  const entries = readdirSync(resolve('client'), { withFileTypes: true })
  return {
    files: entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(),
    directories: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
  }
}

describe('客户端文件归属', () => {
  /**
   * 规则制而不是清单制：这里不列举「哪些文件搬到了哪」，而是钉住「根目录只剩这四个」。
   * 前者随文件数增长自动失效——新加一个 .vue 到根目录不会被任何断言看见；后者会。
   */
  it('根目录只保留入口与全局声明，其余文件都有能力归属', () => {
    const { files } = readClientRoot()

    expect(files).toEqual([...ALLOWED_ROOT_FILES].sort())
  })

  it('顶层目录只有能力目录与三个非能力目录', () => {
    const { directories } = readClientRoot()

    expect(directories).toEqual([...ALLOWED_DIRECTORIES].sort())
  })

  /**
   * 端口三件套的命名。能力标识由目录承担，因此文件名不再重复一遍能力名——
   * `client/mcp/koishi-mcp-admin-port.ts` 这种写法会同时违反去冗余，
   * 并且绕过架构守卫按 `koishi-port.ts` 判定 RPC 持有者的那条规则。
   */
  it('每个持有 RPC 的能力目录都用同一套端口文件名', () => {
    const PORT_TRIO = ['port.ts', 'koishi-port.ts', 'fake-port.ts']

    for (const capability of ['workspace', 'model-request', 'preset', 'mcp', 'onebot-debug', 'test-call', 'test-space']) {
      const files = readdirSync(resolve('client', capability))

      for (const name of PORT_TRIO) expect(files, capability).toContain(name)
      const extras = files.filter((file) => /port\.ts$/.test(file) && !PORT_TRIO.includes(file))
      expect(extras, capability).toEqual([])
    }
  })
})
