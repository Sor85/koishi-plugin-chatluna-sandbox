import { describe, expect, it } from 'vitest'
import { createEvidenceNavigationStack, type EvidenceViewSnapshot } from '../client/webqq/evidence-navigation-stack'

function snapshot(recordId = 'request-1'): EvidenceViewSnapshot {
  return {
    recordId,
    detailView: 'trajectory',
    bodyView: 'analysis',
    trajectoryMode: 'conversation',
    detailScrollTop: 640,
    trajectory: { rowId: 'req:message:contents.0', scrollTop: 1820 },
  }
}

describe('证据定位返回栈', () => {
  it('没有离开过时不能返回', () => {
    const stack = createEvidenceNavigationStack()

    expect(stack.canReturn).toBe(false)
    expect(stack.beginReturn()).toBeUndefined()
    expect(stack.takePending('request-1')).toBeUndefined()
  })

  it('压入快照后可以返回，并在目标详情到达时交出完整快照', () => {
    const stack = createEvidenceNavigationStack()
    stack.push(snapshot())

    expect(stack.canReturn).toBe(true)
    expect(stack.beginReturn()).toMatchObject({
      recordId: 'request-1',
      detailView: 'trajectory',
      bodyView: 'analysis',
      trajectoryMode: 'conversation',
      detailScrollTop: 640,
      trajectory: { rowId: 'req:message:contents.0', scrollTop: 1820 },
    })
    // 开始返回后按钮就该消失：快照已经转为待消费，不能再返回第二次。
    expect(stack.canReturn).toBe(false)
    expect(stack.takePending('request-1')).toMatchObject({ recordId: 'request-1', seq: 1 })
  })

  it('目标详情到达前不消费待恢复快照', () => {
    const stack = createEvidenceNavigationStack()
    stack.push(snapshot())
    stack.beginReturn()

    // 跨请求返回时详情是异步到达的；中途的详情变更不能把快照消费掉。
    expect(stack.takePending(undefined)).toBeUndefined()
    expect(stack.takePending('request-9')).toBeUndefined()
    expect(stack.takePending('request-1')).toMatchObject({ recordId: 'request-1' })
  })

  it('待恢复快照只能消费一次', () => {
    const stack = createEvidenceNavigationStack()
    stack.push(snapshot())
    stack.beginReturn()

    expect(stack.takePending('request-1')).toBeTruthy()
    expect(stack.takePending('request-1')).toBeUndefined()
  })

  it('每次消费给出递增的触发序号，同一位置也能再次恢复', () => {
    const stack = createEvidenceNavigationStack()
    stack.push(snapshot())
    stack.beginReturn()
    expect(stack.takePending('request-1')?.seq).toBe(1)

    stack.push(snapshot())
    stack.beginReturn()
    expect(stack.takePending('request-1')?.seq).toBe(2)
  })

  it('未开始返回时不消费已压入的快照', () => {
    const stack = createEvidenceNavigationStack()
    stack.push(snapshot())

    expect(stack.takePending('request-1')).toBeUndefined()
    expect(stack.canReturn).toBe(true)
  })

  it('清空同时丢弃已压入与待消费的快照', () => {
    const stack = createEvidenceNavigationStack()
    stack.push(snapshot())
    stack.beginReturn()
    stack.push(snapshot('request-2'))

    stack.clear()

    expect(stack.canReturn).toBe(false)
    expect(stack.beginReturn()).toBeUndefined()
    expect(stack.takePending('request-1')).toBeUndefined()
    expect(stack.takePending('request-2')).toBeUndefined()
  })

  it('再次压入会覆盖上一份未使用的快照', () => {
    const stack = createEvidenceNavigationStack()
    stack.push(snapshot('request-1'))
    stack.push(snapshot('request-2'))

    expect(stack.beginReturn()?.recordId).toBe('request-2')
  })
})
