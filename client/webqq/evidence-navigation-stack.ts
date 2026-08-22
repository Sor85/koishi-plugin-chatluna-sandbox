/**
 * 证据定位的返回栈：记录「从哪条模型请求记录、哪个视图页签、哪个账本行和哪个滚动量离开」，
 * 并在目标详情真正到达后交出待恢复快照。
 *
 * 纯数据状态机，不需要 adapter、不访问 DOM、不依赖 Vue。
 */

export interface EvidenceViewSnapshot {
  recordId: string
  detailView: 'trajectory' | 'evidence'
  bodyView: 'request' | 'response' | 'analysis'
  trajectoryMode: 'request' | 'conversation'
  detailScrollTop: number
  trajectory: {
    rowId: string
    scrollTop: number
  }
}

/** 待恢复快照附带的触发序号；轨迹账本靠它触发一次位置恢复，不参与快照内容。 */
export type PendingEvidenceViewSnapshot = EvidenceViewSnapshot & { seq: number }

export function createEvidenceNavigationStack() {
  let saved: EvidenceViewSnapshot | undefined
  let pending: EvidenceViewSnapshot | undefined
  let restoreSeq = 0

  return {
    get canReturn(): boolean {
      return saved !== undefined
    },

    push(snapshot: EvidenceViewSnapshot): void {
      saved = snapshot
    },

    /** 开始返回：交出快照并转为待消费状态，调用方据此发起详情与轨迹读取。 */
    beginReturn(): EvidenceViewSnapshot | undefined {
      if (!saved) return undefined
      pending = saved
      saved = undefined
      return pending
    },

    /**
     * 目标详情到达后消费待恢复快照。
     *
     * 必须按记录身份匹配：跨请求返回时详情是异步到达的，中途的详情变更会先把页签重置掉，
     * 只有目标记录真正到达时恢复才有意义，否则会把快照消费在错误的记录上。
     */
    takePending(recordId: string | undefined): PendingEvidenceViewSnapshot | undefined {
      if (!pending || !recordId || pending.recordId !== recordId) return undefined
      const snapshot = pending
      pending = undefined
      return { ...snapshot, seq: ++restoreSeq }
    },

    clear(): void {
      saved = undefined
      pending = undefined
    },
  }
}
