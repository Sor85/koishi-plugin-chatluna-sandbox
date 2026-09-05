import { describe, expect, it } from 'vitest'
import {
  MODEL_REQUEST_COMPOSITION_KINDS,
  MODEL_REQUEST_COMPOSITION_MIN_SEGMENT_WIDTH,
  MODEL_REQUEST_COMPOSITION_MIN_SLOT_WIDTH,
  MODEL_REQUEST_COMPOSITION_ZOOM_MAX,
  aggregateModelRequestComposition,
  layoutModelRequestCompositionSlots,
  modelRequestCompositionKindOf,
  resolveModelRequestCompositionGranularity,
  type ModelRequestCompositionSlot,
} from '../src/model-request-composition'
import type { SandboxModelRequestPromptCompositionItem } from '../src/types'

/** 均分布局下每格恒为 1/请求数；用它构造「时间上完全不相近」的会话。 */
function spread(count: number, segmentCount: number): ModelRequestCompositionSlot[] {
  return Array.from({ length: count }, () => ({ timeShare: 0, segmentCount }))
}

describe('请求组成粒度判定', () => {
  it('没有请求时按逐条证据，不会因为空会话切到聚合', () => {
    expect(resolveModelRequestCompositionGranularity([])).toBe('evidence')
  })

  it('请求少且分段少时保持逐条证据', () => {
    expect(resolveModelRequestCompositionGranularity(spread(3, 40))).toBe('evidence')
    expect(resolveModelRequestCompositionGranularity(spread(10, 20))).toBe('evidence')
  })

  it('请求多到均分后每段都不足最小宽度时改为聚合', () => {
    expect(resolveModelRequestCompositionGranularity(spread(200, 500))).toBe('aggregate')
    expect(resolveModelRequestCompositionGranularity(spread(50, 130))).toBe('aggregate')
  })

  it('阈值按最大缩放倍率折算：拉到最大倍率仍看得清的会话不聚合', () => {
    // 每格 1/40，段数正好让最大倍率下的分段宽度落在最小宽度上。
    const legible = Math.floor(100 / 40 * MODEL_REQUEST_COMPOSITION_ZOOM_MAX / MODEL_REQUEST_COMPOSITION_MIN_SEGMENT_WIDTH)

    expect(resolveModelRequestCompositionGranularity(spread(40, legible))).toBe('evidence')
    expect(resolveModelRequestCompositionGranularity(spread(40, legible + 1))).toBe('aggregate')
  })

  it('时间不相近就按时间槽判定：耗时占比够宽的请求仍然逐条', () => {
    // 两条请求，一条独占九成时间跨度，另一条只有千分之一——窄的那条决定结果。
    const slots: ModelRequestCompositionSlot[] = [
      { timeShare: 0.9, segmentCount: 400 },
      { timeShare: 0.001, segmentCount: 400 },
    ]

    // 均分布局下每格 50%，两条都够宽，因此仍按逐条下发；只按实际耗时判会白白丢掉细节。
    expect(resolveModelRequestCompositionGranularity(slots)).toBe('evidence')
    expect(resolveModelRequestCompositionGranularity([
      { timeShare: 0.9, segmentCount: 4000 },
      { timeShare: 0.001, segmentCount: 4000 },
    ])).toBe('aggregate')
  })

  it('没有分段的请求不参与判定，进行中的请求不会把整张图推成聚合', () => {
    expect(resolveModelRequestCompositionGranularity([
      { timeShare: 0.5, segmentCount: 6 },
      { timeShare: 0, segmentCount: 0 },
    ])).toBe('evidence')
  })

  it('跨度重叠的请求先按总量归一，不会各自都以为独占全宽', () => {
    // 十条请求同一时刻发出且耗时相同：占比各为 1，加起来是整条轴的十倍。
    const overlapping = Array.from({ length: 10 }, () => ({ timeShare: 1, segmentCount: 300 }))

    // 不归一时每条都按 100% 宽判定，三百段也算看得清；归一后退回均分的 10%，判定与真实空间一致。
    expect(resolveModelRequestCompositionGranularity(overlapping)).toBe('aggregate')
    expect(resolveModelRequestCompositionGranularity(
      overlapping.map(slot => ({ ...slot, segmentCount: 100 })),
    )).toBe('evidence')
  })
})

describe('请求组成聚合', () => {
  const items: readonly SandboxModelRequestPromptCompositionItem[] = [
    { kind: 'user', evidenceId: 'req:message:messages.1', characters: 30, requestId: 'r1' },
    { kind: 'system', evidenceId: 'req:message:messages.0', characters: 100, requestId: 'r1' },
    { kind: 'user', evidenceId: 'variable:v1', characters: 20, variableId: 'v1', variableName: '{name}', requestId: 'r1' },
    { kind: 'tool-interaction', evidenceId: 'req:tool-call:messages.2.tool_calls.0', characters: 7, requestId: 'r1' },
    { kind: 'system', evidenceId: 'req:message:messages.0', characters: 40, requestId: 'r2' },
  ]

  it('每请求每种类折成一段，并按轨道顺序排列', () => {
    expect(aggregateModelRequestComposition(items)).toEqual([
      { kind: 'system', characters: 100, segmentCount: 1, requestId: 'r1' },
      { kind: 'user', characters: 50, segmentCount: 2, requestId: 'r1' },
      { kind: 'tool-interaction', characters: 7, segmentCount: 1, requestId: 'r1' },
      { kind: 'system', characters: 40, segmentCount: 1, requestId: 'r2' },
    ])
  })

  it('字符数只做加总，聚合前后每一档的总量完全相等', () => {
    const aggregated = aggregateModelRequestComposition(items)
    const total = (list: readonly SandboxModelRequestPromptCompositionItem[]) =>
      list.reduce((sum, item) => sum + item.characters, 0)

    expect(total(aggregated)).toBe(total(items))
    for (const kind of MODEL_REQUEST_COMPOSITION_KINDS) {
      expect(total(aggregated.filter(item => item.kind === kind)))
        .toBe(total(items.filter(item => item.kind === kind)))
    }
  })

  it('聚合段不再携带证据身份与变量身份，请求顺序按首次出现保留', () => {
    const aggregated = aggregateModelRequestComposition([...items].reverse())

    expect(aggregated.every(item => item.evidenceId === undefined)).toBe(true)
    expect(aggregated.every(item => item.variableId === undefined)).toBe(true)
    expect([...new Set(aggregated.map(({ requestId }) => requestId))]).toEqual(['r2', 'r1'])
  })

  it('零字符的档位不产出空段', () => {
    expect(aggregateModelRequestComposition([
      { kind: 'system', evidenceId: 'req:message:messages.0', characters: 0, requestId: 'r1' },
      { kind: 'user', evidenceId: 'req:message:messages.1', characters: 5, requestId: 'r1' },
    ])).toEqual([{ kind: 'user', characters: 5, segmentCount: 1, requestId: 'r1' }])
  })
})

describe('轨迹行落在哪条组成轨道', () => {
  it('变量与用户消息同轨，工具调用与工具结果并入工具交互', () => {
    expect(modelRequestCompositionKindOf('variable')).toBe('user')
    expect(modelRequestCompositionKindOf('user')).toBe('user')
    expect(modelRequestCompositionKindOf('tool-call')).toBe('tool-interaction')
    expect(modelRequestCompositionKindOf('tool-result')).toBe('tool-interaction')
    expect(modelRequestCompositionKindOf('system')).toBe('system')
    expect(modelRequestCompositionKindOf('assistant')).toBe('assistant')
    expect(modelRequestCompositionKindOf('tool-definition')).toBe('tool-definition')
  })

  it('请求边界与模型响应不进请求体统计，因此没有轨道', () => {
    expect(modelRequestCompositionKindOf('request')).toBeUndefined()
    expect(modelRequestCompositionKindOf('response')).toBeUndefined()
  })
})

describe('请求时间槽铺位', () => {
  /** 相邻两格是否有重合；重合意味着两条请求的组成会画在同一段横轴上。 */
  function overlaps(boxes: readonly { left: number, width: number }[]) {
    return boxes.slice(1).filter((box, index) => {
      const previous = boxes[index]!
      return box.width > 0 && previous.width > 0 && box.left < previous.left + previous.width - 1e-9
    }).length
  }

  it('按次序均分时每格恰好一份均分宽，首尾贴住两端', () => {
    const boxes = layoutModelRequestCompositionSlots(
      Array.from({ length: 4 }, (_, index) => ({ start: index * 25, span: 25 })),
    )

    expect(boxes).toEqual([
      { left: 0, width: 25 },
      { left: 25, width: 25 },
      { left: 50, width: 25 },
      { left: 75, width: 25 },
    ])
  })

  it('跨度不足下限时补到下限，位置照旧按真实时刻', () => {
    const boxes = layoutModelRequestCompositionSlots([
      { start: 0, span: 0.01 },
      { start: 40, span: 0.01 },
    ])

    expect(boxes[0]).toEqual({ left: 0, width: MODEL_REQUEST_COMPOSITION_MIN_SLOT_WIDTH })
    expect(boxes[1]).toEqual({ left: 40, width: MODEL_REQUEST_COMPOSITION_MIN_SLOT_WIDTH })
  })

  it('时间上挤在一起的几条请求各自分到一格，不再互相重合', () => {
    // 二十小时的会话里连着发了四次十秒请求：自然起点只差万分之几，各自都要占到下限那么宽。
    const boxes = layoutModelRequestCompositionSlots([
      { start: 99.9, span: 0.014 },
      { start: 99.92, span: 0.014 },
      { start: 99.94, span: 0.014 },
      { start: 99.96, span: 0.014 },
    ])

    expect(overlaps(boxes)).toBe(0)
    // 四格各 0.75% 宽，末格右边界正好贴住轴的终点：起点被「后面还要留几格」逐格顶回来。
    expect(boxes.map(({ left }) => Math.round(left * 100) / 100)).toEqual([97, 97.75, 98.5, 99.25])
    expect(boxes.at(-1)).toEqual({ left: 99.25, width: MODEL_REQUEST_COMPOSITION_MIN_SLOT_WIDTH })
  })

  it('末尾几格不会被挤出轴外：每格都为后面的请求留出下限宽度', () => {
    const boxes = layoutModelRequestCompositionSlots([
      { start: 0, span: 99 },
      { start: 99, span: 1 },
      { start: 99.5, span: 0.5 },
    ])

    expect(overlaps(boxes)).toBe(0)
    expect(boxes.every(({ left, width }) => left >= 0 && left + width <= 100 + 1e-9)).toBe(true)
    expect(boxes[0]!.width).toBeCloseTo(98.5)
  })

  it('请求多到均分宽小于下限时下限让步，总宽仍然铺不出轴外', () => {
    const boxes = layoutModelRequestCompositionSlots(
      Array.from({ length: 400 }, () => ({ start: 100, span: 0.001 })),
    )

    expect(overlaps(boxes)).toBe(0)
    expect(boxes.every(({ width }) => width === 0.25)).toBe(true)
    expect(boxes.at(-1)!.left + boxes.at(-1)!.width).toBeCloseTo(100)
  })

  it('进行中的请求只标起点：不占宽度，也不推开后面的请求', () => {
    const boxes = layoutModelRequestCompositionSlots([
      { start: 0, span: 30 },
      { start: 30, span: 0 },
      { start: 30, span: 20 },
    ])

    expect(boxes[1]).toEqual({ left: 30, width: 0 })
    expect(boxes[2]).toEqual({ left: 30, width: 20 })
  })

  it('没有请求或全部进行中时不产出任何宽度', () => {
    expect(layoutModelRequestCompositionSlots([])).toEqual([])
    expect(layoutModelRequestCompositionSlots([{ start: 0, span: 0 }])).toEqual([{ left: 0, width: 0 }])
  })
})
