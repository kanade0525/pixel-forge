import { describe, it, expect } from 'vitest'
import { convert } from './pipeline'
import { makePalette } from './palettes/palettes'
import type { ConvertOptions, PixelImage } from './types'

const RGB = makePalette('rgb', 'rgb', ['ff0000', '00ff00', '0000ff', '000000', 'ffffff'])

function solid(w: number, h: number, r: number, g: number, b: number): PixelImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
  return { width: w, height: h, data }
}

const base: Omit<ConvertOptions, 'dither'> = {
  targetW: 2,
  targetH: 2,
  downscale: 'area',
  palette: RGB,
  bayerSize: 4,
  deltaMode: '76',
  strength: 1,
  serpentine: true,
}

describe('convert', () => {
  it('目標サイズに縮小される', () => {
    const out = convert(solid(16, 16, 255, 0, 0), { ...base, dither: 'none' })
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
  })
  it('単色赤 → 全画素が赤（各手法とも）', () => {
    for (const dither of ['none', 'ordered', 'fs'] as const) {
      const out = convert(solid(8, 8, 255, 0, 0), { ...base, dither })
      for (let i = 0; i < out.data.length; i += 4) {
        expect(out.data[i]).toBe(255)
        expect(out.data[i + 1]).toBe(0)
        expect(out.data[i + 2]).toBe(0)
      }
    }
  })
  it('非正方形サイズ(16x28)も扱える', () => {
    const out = convert(solid(64, 64, 10, 200, 50), { ...base, targetW: 16, targetH: 28, dither: 'fs' })
    expect(out.width).toBe(16)
    expect(out.height).toBe(28)
  })
})
