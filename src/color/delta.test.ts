import { describe, it, expect } from 'vitest'
import { deltaE76, ciede2000 } from './delta'
import { rgbToLab } from './space'

describe('ΔE76', () => {
  it('同色は0', () => {
    const lab = rgbToLab(120, 80, 40)
    expect(deltaE76(lab, lab)).toBeCloseTo(0, 6)
  })
  it('白と黒は大きい', () => {
    expect(deltaE76(rgbToLab(255, 255, 255), rgbToLab(0, 0, 0))).toBeCloseTo(100, 0)
  })
})

describe('CIEDE2000', () => {
  it('同色は0', () => {
    const lab = rgbToLab(200, 30, 90)
    expect(ciede2000(lab, lab)).toBeCloseTo(0, 6)
  })
  // Sharma et al. のテストデータ（一部）
  it('参照データ: (50,2.6772,-79.7751) vs (50,0,-82.7485) ≈ 2.0425', () => {
    const d = ciede2000({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 })
    expect(d).toBeCloseTo(2.0425, 3)
  })
  it('参照データ: (50,2.5,0) vs (50,0,-2.5) ≈ 4.3065', () => {
    const d = ciede2000({ L: 50, a: 2.5, b: 0 }, { L: 50, a: 0, b: -2.5 })
    expect(d).toBeCloseTo(4.3065, 3)
  })
  it('参照データ: (63.0109,-31.0961,-5.8663) vs (62.8187,-29.7946,-4.0864) ≈ 1.2630', () => {
    const d = ciede2000(
      { L: 63.0109, a: -31.0961, b: -5.8663 },
      { L: 62.8187, a: -29.7946, b: -4.0864 }
    )
    expect(d).toBeCloseTo(1.263, 3)
  })
})
