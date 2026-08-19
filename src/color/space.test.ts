import { describe, it, expect } from 'vitest'
import { srgbToLinear, linearToSrgb, rgbToLab, linearRgbToLab } from './space'

describe('sRGB <-> linear', () => {
  it('端点', () => {
    expect(srgbToLinear(0)).toBeCloseTo(0, 6)
    expect(srgbToLinear(255)).toBeCloseTo(1, 6)
    expect(linearToSrgb(0)).toBe(0)
    expect(linearToSrgb(1)).toBe(255)
  })
  it('往復', () => {
    for (const v of [0, 1, 15, 64, 128, 200, 255]) {
      expect(linearToSrgb(srgbToLinear(v))).toBe(v)
    }
  })
})

describe('rgbToLab（既知値, D65）', () => {
  it('白 = L100', () => {
    const lab = rgbToLab(255, 255, 255)
    expect(lab.L).toBeCloseTo(100, 1)
    expect(lab.a).toBeCloseTo(0, 1)
    expect(lab.b).toBeCloseTo(0, 1)
  })
  it('黒 = L0', () => {
    const lab = rgbToLab(0, 0, 0)
    expect(lab.L).toBeCloseTo(0, 3)
  })
  it('中間グレー ~ L53.4', () => {
    const lab = rgbToLab(128, 128, 128)
    expect(lab.L).toBeCloseTo(53.4, 0)
    expect(Math.abs(lab.a)).toBeLessThan(0.5)
    expect(Math.abs(lab.b)).toBeLessThan(0.5)
  })
  it('赤 = 正のa, 正のb', () => {
    const lab = rgbToLab(255, 0, 0)
    expect(lab.a).toBeGreaterThan(60)
    expect(lab.b).toBeGreaterThan(30)
  })
  it('linearRgbToLab と rgbToLab が整合', () => {
    const a = rgbToLab(200, 100, 50)
    const b = linearRgbToLab(srgbToLinear(200), srgbToLinear(100), srgbToLinear(50))
    expect(b.L).toBeCloseTo(a.L, 6)
    expect(b.a).toBeCloseTo(a.a, 6)
    expect(b.b).toBeCloseTo(a.b, 6)
  })
})
