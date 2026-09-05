import type {
  SandboxModelRequestPromptCompositionGranularity,
  SandboxModelRequestPromptCompositionItem,
  SandboxModelRequestPromptKind,
  SandboxModelRequestTrajectoryKind,
} from './types'

/**
 * 请求组成图的轨道顺序、分段可辨识度判定与按请求聚合。
 *
 * 与证据种类 module 同一形状的浏览器安全纯 module：不依赖 Node、Koishi、Vue 或 DOM，
 * 因此服务端派生组成项与客户端铺轨道共用同一份顺序、同一个最小宽度和同一条粒度判据。
 * 三者任意一侧自己留一份，都会表现为「服务端按聚合下发、客户端仍按逐段量宽度」这类无声错位。
 *
 * 它只描述组成图的几何与粒度，不描述字符怎么数（那是模型证据投影的度量）、
 * 也不描述账本行怎么展开（那是轨迹派生的事）。
 */

/**
 * 组成图的轨道顺序，按证据在请求体里出现的先后排列：
 * 系统前缀 → 用户消息 → 能力目录 → 模型自己的发言 → 工具往返。
 * Assistant 紧贴 Tool I/O，两者的分段都落在请求尾部，同屏才能看出一次工具往返由哪条发言发起。
 *
 * 单请求与完整会话共用这一份顺序：两种模式的分段来自同一份组成投影，只是横轴一个按占比、
 * 一个按时间铺开；各自留一份种类清单会让同一条会话在切换模式时凭空多出或少掉几条轨道。
 * 聚合粒度也按它排每个请求内部的先后，因此两种粒度的读法一致。
 */
export const MODEL_REQUEST_COMPOSITION_KINDS: readonly SandboxModelRequestPromptKind[] = Object.freeze([
  'system',
  'user',
  'tool-definition',
  'assistant',
  'tool-interaction',
])

/**
 * 一条分段仍然看得清的最小宽度，单位是占整条轨道的百分比。
 *
 * 视图给每条分段兜的最小宽度就是这个数：低于它的分段在默认倍率下已经不足一个像素宽。
 */
export const MODEL_REQUEST_COMPOSITION_MIN_SEGMENT_WIDTH = 0.35

/**
 * 一条请求的时间槽至少多宽，单位同样是占整条轴的百分比。
 *
 * 只按真实耗时铺开时，一次十秒的请求在跨越二十小时的会话里不到千分之一，连一个像素都画不出，
 * 那一格里的组成因此完全读不到。这个下限保证每条请求都还留有一格可读的位置；代价是宽度在
 * 下限处不再等于真实耗时，位置仍然是真实的。
 */
export const MODEL_REQUEST_COMPOSITION_MIN_SLOT_WIDTH = 0.75

/** 轨道横向缩放的上下界与步长。粒度判据要按最大倍率算，因此上界与判据同住一处。 */
export const MODEL_REQUEST_COMPOSITION_ZOOM_MIN = 1
export const MODEL_REQUEST_COMPOSITION_ZOOM_MAX = 10
export const MODEL_REQUEST_COMPOSITION_ZOOM_STEP = 0.25

/** 判定粒度所需的每个请求一格：它在时间轴上占多宽，逐段粒度下会画出多少段。 */
export interface ModelRequestCompositionSlot {
  /** 按实际耗时布局时该请求占整条轴的比例（0~1）。进行中的请求没有跨度，取 0。 */
  timeShare: number
  /** 逐段粒度下该请求会画出的分段数。 */
  segmentCount: number
}

/** 一条请求在时间轴上的自然位置，两项都是占整条轴的百分比。 */
export interface ModelRequestCompositionSlotSpan {
  /** 自然起点：按实际耗时布局时由开始时刻求得，按次序均分时由序号求得。 */
  start: number
  /** 自然宽度。进行中的请求跨度未知，取 0——它只在轴上标出起点，不占可读的宽度。 */
  span: number
}

/** 一条请求实际铺到的那一格。 */
export interface ModelRequestCompositionSlotBox {
  left: number
  width: number
}

/**
 * 把每条请求的自然位置铺成互不重叠的时间槽。
 *
 * 最小宽度必然带来重叠：两条相隔九秒的请求在跨越二十小时的会话里自然起点只差万分之一，
 * 而各自都要占到下限那么宽，于是两格画在同一段横轴上。默认倍率下它只是一条 0.75% 宽的糊涂
 * 细线，看不出问题；一旦放大到那一格，两三条请求的组成就完整地叠在一起——一条请求的 Tool Defs
 * 横穿另一条请求的 Assistant，读出来的占比毫无意义。轨道支持放大到单条请求之后，这个重叠
 * 从看不见的糊涂变成了首屏就能看到的错。
 *
 * 因此这里做一次单向扫描：每格的起点不早于前一格的终点，并为后面每一格各留出一份下限宽度，
 * 否则末尾几格会被挤到轴外。挤不开时下限自己让步（退到均分宽），因此无论多少条请求，结果都是
 * 一份落在 [0, 100] 内、按输入顺序单调递增且互不重叠的划分。
 *
 * 输入按时间先后给出，扫描因此不改变请求的先后；跨度为 0 的请求不占位也不推进扫描位置。
 */
export function layoutModelRequestCompositionSlots(
  spans: readonly ModelRequestCompositionSlotSpan[],
  minWidth: number = MODEL_REQUEST_COMPOSITION_MIN_SLOT_WIDTH,
): ModelRequestCompositionSlotBox[] {
  const sizable = spans.reduce((count, { span }) => span > 0 ? count + 1 : count, 0)
  const floor = sizable ? Math.min(minWidth, 100 / sizable) : minWidth
  let pendingFloors = sizable
  let cursor = 0
  return spans.map(({ start, span }) => {
    if (span <= 0) return { left: Math.min(Math.max(start, cursor), 100), width: 0 }
    pendingFloors -= 1
    const reserved = pendingFloors * floor
    const left = Math.min(Math.max(start, cursor), Math.max(100 - reserved - floor, 0))
    const width = Math.min(Math.max(span, floor), Math.max(100 - reserved - left, 0))
    cursor = left + width
    return { left, width }
  })
}

/**
 * 会话组成图该按逐段还是按聚合下发。
 *
 * 判据是几何而不是记录条数：一个请求的分段能不能看清，取决于它的时间槽有多宽、槽里要塞几段。
 * 两种横轴布局都算一遍并取宽的那个——按实际耗时铺开时槽宽由耗时决定，按次序均分时每格恒为
 * `1/请求数`，用户随时可以切换，只按其中一种判会让另一种布局白白丢掉细节。
 *
 * 时间槽占比先按总量归一：几条请求的跨度重叠时占比之和会超过整条轴，各自都以为独占全宽，
 * 归一后重叠的那几条一起退回均分宽度，也就是它们真正能分到的空间。
 *
 * 宽度按最大缩放倍率折算，因此「放大就能看清」的会话仍然按逐段下发：只有连拉到最大倍率
 * 都挤不开的会话才聚合，聚合因此不会拿走用户本来够得到的细节。
 */
export function resolveModelRequestCompositionGranularity(
  slots: readonly ModelRequestCompositionSlot[],
): SandboxModelRequestPromptCompositionGranularity {
  if (!slots.length) return 'evidence'
  const evenShare = 1 / slots.length
  const totalShare = slots.reduce((sum, slot) => sum + Math.max(slot.timeShare, 0), 0)
  const scale = totalShare > 1 ? 1 / totalShare : 1
  const legible = slots.every((slot) => {
    if (slot.segmentCount <= 0) return true
    const share = Math.max(Math.max(slot.timeShare, 0) * scale, evenShare)
    const widest = share * 100 * MODEL_REQUEST_COMPOSITION_ZOOM_MAX / slot.segmentCount
    return widest >= MODEL_REQUEST_COMPOSITION_MIN_SEGMENT_WIDTH
  })
  return legible ? 'evidence' : 'aggregate'
}

/**
 * 把逐段组成项折成「每请求 × 每种类」一段。
 *
 * 字符数只做加总，不重新度量：聚合段的占比因此与逐段粒度下同一档的占比之和完全相等，
 * 切换粒度不会让同一条会话的轨道厚度发生变化。变量片段在逐段粒度下已经带着 User 种类，
 * 折叠后自然并入 User 档，两种粒度的种类归属因此也一致。
 */
export function aggregateModelRequestComposition(
  items: readonly SandboxModelRequestPromptCompositionItem[],
): SandboxModelRequestPromptCompositionItem[] {
  const byRequest = new Map<string, Map<SandboxModelRequestPromptKind, { characters: number, segmentCount: number }>>()
  const order: string[] = []
  for (const item of items) {
    const requestId = item.requestId ?? ''
    let kinds = byRequest.get(requestId)
    if (!kinds) {
      kinds = new Map()
      byRequest.set(requestId, kinds)
      order.push(requestId)
    }
    const bucket = kinds.get(item.kind) ?? { characters: 0, segmentCount: 0 }
    bucket.characters += item.characters
    bucket.segmentCount += 1
    kinds.set(item.kind, bucket)
  }

  const aggregated: SandboxModelRequestPromptCompositionItem[] = []
  for (const requestId of order) {
    const kinds = byRequest.get(requestId)!
    for (const kind of MODEL_REQUEST_COMPOSITION_KINDS) {
      const bucket = kinds.get(kind)
      if (!bucket || bucket.characters <= 0) continue
      aggregated.push({
        kind,
        characters: bucket.characters,
        segmentCount: bucket.segmentCount,
        ...(requestId ? { requestId } : {}),
      })
    }
  }
  return aggregated
}

/**
 * 某种轨迹行落在组成图的哪条轨道上。
 *
 * 聚合分段没有单一证据身份，因此「当前选中的行属不属于这一段」只能按请求加轨道判断。
 * 请求边界与模型响应不进请求体统计，两者都返回缺省。
 */
export function modelRequestCompositionKindOf(
  kind: SandboxModelRequestTrajectoryKind,
): SandboxModelRequestPromptKind | undefined {
  if (kind === 'system' || kind === 'assistant' || kind === 'tool-definition') return kind
  // 模型请求变量在组成图中统一投影到 User 轨道，与逐段粒度的切分口径一致。
  if (kind === 'user' || kind === 'variable') return 'user'
  if (kind === 'tool-call' || kind === 'tool-result') return 'tool-interaction'
  return undefined
}
