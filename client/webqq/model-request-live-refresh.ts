export const MODEL_REQUEST_LIVE_REFRESH_INTERVAL_MS = 2000

export interface ModelRequestLiveRefreshOptions {
  intervalMs?: number
  isEnabled: () => boolean
  isVisible: () => boolean
  refresh: () => void
  setInterval?: (handler: () => void, timeout: number) => ReturnType<typeof setInterval>
  clearInterval?: (id: ReturnType<typeof setInterval>) => void
}

// Koishi 控制台用 <keep-alive> 缓存整页，onMounted 与 onActivated 会在首次进入时同拍触发。
// 合并成一次微任务，避免每次打开模型请求页连打两次 Console RPC。
export function createModelRequestEnterRefresh(refresh: () => void) {
  let queued = false

  function schedule() {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      refresh()
    })
  }

  return { schedule }
}

// 页面隐藏或离开视图时必须停表：后台继续 2 秒轮询会空耗 Console RPC，
// 也会在用户回来时覆盖正在翻看的分页。可见且开关仍开时再恢复，而不是重新打开开关。
export function createModelRequestLiveRefresh(options: ModelRequestLiveRefreshOptions) {
  const intervalMs = options.intervalMs ?? MODEL_REQUEST_LIVE_REFRESH_INTERVAL_MS
  const schedule = options.setInterval ?? setInterval
  const cancel = options.clearInterval ?? clearInterval
  let timer: ReturnType<typeof setInterval> | undefined

  function sync() {
    const shouldRun = options.isEnabled() && options.isVisible()
    if (shouldRun && timer === undefined) {
      timer = schedule(() => {
        if (options.isEnabled() && options.isVisible()) options.refresh()
      }, intervalMs)
      return
    }
    if (!shouldRun && timer !== undefined) {
      cancel(timer)
      timer = undefined
    }
  }

  function dispose() {
    if (timer !== undefined) cancel(timer)
    timer = undefined
  }

  function isRunning() {
    return timer !== undefined
  }

  return { sync, dispose, isRunning }
}
