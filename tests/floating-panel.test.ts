import { describe, expect, it } from 'vitest'
import { getFloatingPanelPosition } from '../client/webqq/floating-panel'

describe('WebQQ 局部浮层定位', () => {
  it('从点击位置右下方展开，并在视口边缘内翻', () => {
    expect(getFloatingPanelPosition(
      { x: 240, y: 180 },
      { width: 1200, height: 800 },
      { width: 380, height: 520 },
    )).toEqual({ x: 248, y: 188 })

    expect(getFloatingPanelPosition(
      { x: 1100, y: 760 },
      { width: 1200, height: 800 },
      { width: 380, height: 520 },
    )).toEqual({ x: 808, y: 268 })
  })
})
