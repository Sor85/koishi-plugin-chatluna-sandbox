import { describe, expect, it } from 'vitest'
import {
  clampImagePreviewOffset,
  clampImagePreviewScale,
  createImagePreviewZoom,
  IMAGE_PREVIEW_CLICK_SUPPRESSION_MS,
  IMAGE_PREVIEW_DRAG_THRESHOLD_PX,
  IMAGE_PREVIEW_ZOOM_FACTOR,
  IMAGE_PREVIEW_ZOOM_MAX,
  IMAGE_PREVIEW_ZOOM_MIN,
  type ImagePreviewCaptureTarget,
  type ImagePreviewMetrics,
} from '../client/webqq/image-preview-zoom'

/** 贴合后 400x300 的图片落在 800x600 的遮罩里：两个方向都还有余量，便于验证夹取的两侧。 */
const METRICS: ImagePreviewMetrics = {
  baseWidth: 400,
  baseHeight: 300,
  viewportWidth: 800,
  viewportHeight: 600,
}

class FakeCaptureTarget implements ImagePreviewCaptureTarget {
  readonly captured = new Set<number>()

  setPointerCapture(pointerId: number) {
    this.captured.add(pointerId)
  }

  releasePointerCapture(pointerId: number) {
    this.captured.delete(pointerId)
  }

  hasPointerCapture(pointerId: number) {
    return this.captured.has(pointerId)
  }
}

function harness(overrides: { metrics?: ImagePreviewMetrics | undefined } = {}) {
  const metrics = 'metrics' in overrides ? overrides.metrics : METRICS
  const target = new FakeCaptureTarget()
  let clock = 1000
  const zoom = createImagePreviewZoom({
    metrics: () => metrics,
    // 遮罩铺满 800x600 的视口，中心就在 (400, 300)。
    center: () => ({ x: 400, y: 300 }),
    captureTarget: () => target,
    now: () => clock,
  })
  return { zoom, target, advance: (ms: number) => { clock += ms } }
}

describe('图片预览缩放平移', () => {
  describe('倍率夹取', () => {
    it('贴合倍率是下界，不做比贴合更小的缩小', () => {
      expect(clampImagePreviewScale(0.2)).toBe(IMAGE_PREVIEW_ZOOM_MIN)
      expect(IMAGE_PREVIEW_ZOOM_MIN).toBe(1)
    })

    it('上界之外一律夹回上界', () => {
      expect(clampImagePreviewScale(1000)).toBe(IMAGE_PREVIEW_ZOOM_MAX)
    })

    it('界内原样返回', () => {
      expect(clampImagePreviewScale(2.5)).toBe(2.5)
    })
  })

  describe('滚轮', () => {
    it('向上滚按因子放大，向下滚按同一因子还原', () => {
      const { zoom } = harness()
      zoom.handleWheel({ deltaY: -100, clientX: 400, clientY: 300 })
      expect(zoom.scale.value).toBeCloseTo(IMAGE_PREVIEW_ZOOM_FACTOR)
      zoom.handleWheel({ deltaY: 100, clientX: 400, clientY: 300 })
      expect(zoom.scale.value).toBeCloseTo(IMAGE_PREVIEW_ZOOM_MIN)
    })

    /** 乘法步进：连滚两格等于因子的平方，而不是两倍步长。 */
    it('连续放大按乘法累积', () => {
      const { zoom } = harness()
      zoom.handleWheel({ deltaY: -100, clientX: 400, clientY: 300 })
      zoom.handleWheel({ deltaY: -100, clientX: 400, clientY: 300 })
      expect(zoom.scale.value).toBeCloseTo(IMAGE_PREVIEW_ZOOM_FACTOR ** 2)
    })

    it('deltaY 为 0 时什么都不做', () => {
      const { zoom } = harness()
      zoom.handleWheel({ deltaY: 0, clientX: 500, clientY: 300 })
      expect(zoom.scale.value).toBe(IMAGE_PREVIEW_ZOOM_MIN)
    })

    it('滚到上下界就停住，不再累积', () => {
      const { zoom } = harness()
      for (let index = 0; index < 60; index += 1) zoom.handleWheel({ deltaY: -100, clientX: 400, clientY: 300 })
      expect(zoom.scale.value).toBe(IMAGE_PREVIEW_ZOOM_MAX)
      for (let index = 0; index < 120; index += 1) zoom.handleWheel({ deltaY: 100, clientX: 400, clientY: 300 })
      expect(zoom.scale.value).toBe(IMAGE_PREVIEW_ZOOM_MIN)
    })

    /**
     * 锚点补偿：已经放大到溢出可视区后，指针在中心右侧 100px 处再放大一格，
     * 锚点下的像素必须仍落在那 100px 上。按公式 `d - (d - offset) * ratio` = `100 - 100 * 1.2` = -20。
     * 少做补偿的表现是位移保持 0，视野咬住图片中心，指着的细节反而移出视野。
     */
    it('以指针为锚点补偿位移，指针下的像素保持不动', () => {
      const { zoom } = harness()
      zoom.zoomTo(2.5)
      zoom.handleWheel({ deltaY: -100, clientX: 500, clientY: 300 })
      expect(zoom.offset.value.x).toBeCloseTo(100 - 100 * IMAGE_PREVIEW_ZOOM_FACTOR)
      expect(zoom.offset.value.y).toBeCloseTo(0)
    })

    /**
     * 图片还没涨到溢出可视区时，锚点补偿算出的位移会被夹取吸收回 0——此时图片四周都有留白，
     * 偏移它只会让它飘在遮罩里。这条钉住「先居中、溢出后才跟着指针走」的交接点。
     */
    it('尚未溢出可视区时补偿被夹取吸收，保持居中', () => {
      const { zoom } = harness()
      zoom.handleWheel({ deltaY: -100, clientX: 500, clientY: 300 })
      expect(zoom.scale.value).toBeCloseTo(IMAGE_PREVIEW_ZOOM_FACTOR)
      expect(zoom.offset.value).toEqual({ x: 0, y: 0 })
    })

    it('图片还没加载完时整体停摆', () => {
      const { zoom } = harness({ metrics: undefined })
      zoom.handleWheel({ deltaY: -100, clientX: 400, clientY: 300 })
      expect(zoom.scale.value).toBe(IMAGE_PREVIEW_ZOOM_MIN)
    })
  })

  describe('位移夹取', () => {
    /** 放大 3 倍后图片 1200x900，比 800x600 的遮罩各超出 400x300，因此两边各允许 200x150。 */
    it('按当前倍率下的溢出量各允许一半', () => {
      expect(clampImagePreviewOffset({ x: 999, y: 999 }, 3, METRICS)).toEqual({ x: 200, y: 150 })
      expect(clampImagePreviewOffset({ x: -999, y: -999 }, 3, METRICS)).toEqual({ x: -200, y: -150 })
    })

    /** 没超出可视区的方向锁死在 0：可自由拖动的小图会飘在遮罩里，且没有归位依据。 */
    it('未超出可视区的方向锁死居中', () => {
      expect(clampImagePreviewOffset({ x: 120, y: 120 }, 1, METRICS)).toEqual({ x: 0, y: 0 })
    })

    /** 只有一个方向溢出时，另一个方向仍锁死。 */
    it('两个方向各自判断', () => {
      const wide: ImagePreviewMetrics = { baseWidth: 800, baseHeight: 200, viewportWidth: 400, viewportHeight: 600 }
      expect(clampImagePreviewOffset({ x: 999, y: 999 }, 1, wide)).toEqual({ x: 200, y: 0 })
    })

    it('范围内原样返回', () => {
      expect(clampImagePreviewOffset({ x: 50, y: -40 }, 3, METRICS)).toEqual({ x: 50, y: -40 })
    })
  })

  describe('拖动平移', () => {
    function zoomIn(zoom: ReturnType<typeof harness>['zoom'], scale: number) {
      zoom.zoomTo(scale)
      expect(zoom.scale.value).toBe(scale)
    }

    it('放大后按住拖动改变位移', () => {
      const { zoom } = harness()
      zoomIn(zoom, 3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 440, clientY: 320 })
      expect(zoom.dragging.value).toBe(true)
      expect(zoom.offset.value).toEqual({ x: 40, y: 20 })
    })

    /** 贴合倍率下没有可拖的余量，直接不进入拖动，避免把图片拖出视野。 */
    it('贴合倍率下不进入拖动', () => {
      const { zoom } = harness()
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 500, clientY: 400 })
      expect(zoom.dragging.value).toBe(false)
      expect(zoom.offset.value).toEqual({ x: 0, y: 0 })
    })

    it('位移不超过阈值仍算单击，不进入拖动', () => {
      const { zoom } = harness()
      zoomIn(zoom, 3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 400 + IMAGE_PREVIEW_DRAG_THRESHOLD_PX - 1, clientY: 300 })
      expect(zoom.dragging.value).toBe(false)
      expect(zoom.offset.value).toEqual({ x: 0, y: 0 })
    })

    /** 越过阈值那一拍才接住指针：更早接住会把落在图片上的单击改派掉。 */
    it('越过阈值才接住指针，松手时释放', () => {
      const { zoom, target } = harness()
      zoomIn(zoom, 3)
      zoom.handlePointerDown({ pointerId: 7, button: 0, clientX: 400, clientY: 300 })
      expect(target.captured.has(7)).toBe(false)
      zoom.handlePointerMove({ pointerId: 7, clientX: 460, clientY: 300 })
      expect(target.captured.has(7)).toBe(true)
      zoom.finishDrag({ pointerId: 7, clientX: 460, clientY: 300 })
      expect(target.captured.has(7)).toBe(false)
    })

    it('右键不进入拖动', () => {
      const { zoom } = harness()
      zoomIn(zoom, 3)
      zoom.handlePointerDown({ pointerId: 1, button: 2, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 500, clientY: 300 })
      expect(zoom.dragging.value).toBe(false)
    })

    it('别的指针的移动与松手都不影响本次拖动', () => {
      const { zoom } = harness()
      zoomIn(zoom, 3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 2, clientX: 500, clientY: 400 })
      expect(zoom.offset.value).toEqual({ x: 0, y: 0 })
      zoom.finishDrag({ pointerId: 2, clientX: 500, clientY: 400 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 440, clientY: 300 })
      expect(zoom.offset.value).toEqual({ x: 40, y: 0 })
    })

    it('拖动同样受位移夹取约束', () => {
      const { zoom } = harness()
      zoomIn(zoom, 3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 5000, clientY: 5000 })
      expect(zoom.offset.value).toEqual({ x: 200, y: 150 })
    })
  })

  describe('拖动后吃掉一次 click', () => {
    /**
     * 遮罩靠 `click.self` 关闭预览。拖动图片后在遮罩上松手，那次 click 的目标是遮罩，
     * `.self` 成立——不吃掉它，拖一下图片就把预览关了。
     */
    it('真发生过拖动才吃掉，并且只吃一次', () => {
      const { zoom } = harness()
      zoom.zoomTo(3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 460, clientY: 300 })
      zoom.finishDrag({ pointerId: 1, clientX: 460, clientY: 300 })
      expect(zoom.consumeSuppressedClick()).toBe(true)
      expect(zoom.consumeSuppressedClick()).toBe(false)
    })

    it('没越过阈值的按下松手不吃掉后续 click', () => {
      const { zoom } = harness()
      zoom.zoomTo(3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.finishDrag({ pointerId: 1, clientX: 400, clientY: 300 })
      expect(zoom.consumeSuppressedClick()).toBe(false)
    })

    it('超过抑制窗口后不再吃掉', () => {
      const { zoom, advance } = harness()
      zoom.zoomTo(3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 460, clientY: 300 })
      zoom.finishDrag({ pointerId: 1, clientX: 460, clientY: 300 })
      advance(IMAGE_PREVIEW_CLICK_SUPPRESSION_MS + 1)
      expect(zoom.consumeSuppressedClick()).toBe(false)
    })
  })

  describe('重置', () => {
    it('回到贴合态并清掉位移与拖动', () => {
      const { zoom } = harness()
      zoom.zoomTo(3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 460, clientY: 300 })
      zoom.reset()
      expect(zoom.scale.value).toBe(IMAGE_PREVIEW_ZOOM_MIN)
      expect(zoom.offset.value).toEqual({ x: 0, y: 0 })
      expect(zoom.dragging.value).toBe(false)
      // 重置也要清掉抑制窗口，否则换图后第一次点遮罩会被莫名吃掉。
      expect(zoom.consumeSuppressedClick()).toBe(false)
    })

    /** 重置之后拖动状态也不该残留：继续移动同一个指针不得改变位移。 */
    it('重置后残留的指针移动不再生效', () => {
      const { zoom } = harness()
      zoom.zoomTo(3)
      zoom.handlePointerDown({ pointerId: 1, button: 0, clientX: 400, clientY: 300 })
      zoom.handlePointerMove({ pointerId: 1, clientX: 460, clientY: 300 })
      zoom.reset()
      zoom.handlePointerMove({ pointerId: 1, clientX: 520, clientY: 300 })
      expect(zoom.offset.value).toEqual({ x: 0, y: 0 })
    })
  })
})
