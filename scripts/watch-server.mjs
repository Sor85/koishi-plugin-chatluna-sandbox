import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(root, 'src')
const tsup = resolve(root, 'node_modules/tsup/dist/cli-default.js')

let building = false
let rebuildPending = false
let activeBuild
let shuttingDown = false
let snapshot = new Map()

async function collectSourceTimes(directory, entries = new Map()) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name)
    const info = await stat(path)
    if (info.isDirectory()) await collectSourceTimes(path, entries)
    else if (['.ts', '.json'].includes(extname(name))) entries.set(path, info.mtimeMs)
  }
  return entries
}

function build() {
  if (building) {
    rebuildPending = true
    return
  }
  building = true
  activeBuild = spawn(process.execPath, [tsup, 'src/index.ts', '--format', 'cjs', '--out-dir', 'lib', '--clean', 'false'], {
    cwd: root,
    stdio: 'inherit',
  })
  activeBuild.once('exit', (code, signal) => {
    activeBuild = undefined
    building = false
    if (shuttingDown) return
    if (code !== 0) {
      console.error(`服务端构建失败（${signal ? `信号 ${signal}` : `退出码 ${code ?? 1}`}），继续等待下一次源码修改。`)
    }
    if (rebuildPending) {
      rebuildPending = false
      build()
    }
  })
}

async function poll() {
  const next = await collectSourceTimes(sourceRoot)
  const changed = next.size !== snapshot.size
    || [...next].some(([path, mtime]) => snapshot.get(path) !== mtime)
  snapshot = next
  if (changed) build()
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(pollTimer)
  activeBuild?.kill('SIGTERM')
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

console.log(`正在监听服务端源码：${sourceRoot}`)
snapshot = await collectSourceTimes(sourceRoot)
build()
// macOS 的递归 fs.watch 在 launchd 环境中可能漏掉原位写入；轮询 mtime 可覆盖编辑器保存、Git 切换和脚本修改。
const pollTimer = setInterval(() => void poll().catch((error) => console.error('扫描服务端源码失败：', error)), 250)
