import { describe, it, expect } from 'vitest'
import { makePalette } from '../palettes/palettes'
import { quantizeNearest } from './nearest'
import { quantizeOrdered } from './ordered'
import { quantizeFloydSteinberg } from './floyd-steinberg'
import { bayerMatrix } from './bayer'
import type { PixelImage } from '../types'

const BW = makePalette('bw', 'bw', ['000000', 'ffffff'])
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

function paletteKeys(pal: { colors: { r: number; g: number; b: number }[] }): Set<string> {
  return new Set(pal.colors.map((c) => `${c.r},${c.g},${c.b}`))
}

function allInPalette(img: PixelImage, keys: Set<string>): boolean {
  for (let i = 0; i < img.data.length; i += 4) {
    if (!keys.has(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`)) return false
  }
  return true
}

describe('quantizeNearest', () => {
  it('純赤は赤にマップされ均一', () => {
    const img = quantizeNearest(solid(4, 4, 255, 0, 0), RGB, '76')
    expect(allInPalette(img, paletteKeys(RGB))).toBe(true)
    expect(img.data[0]).toBe(255)
    expect(img.data[1]).toBe(0)
    expect(img.data[2]).toBe(0)
  })
  it('アルファは保持', () => {
    const img = solid(2, 2, 10, 10, 10)
    img.data[3] = 128
    quantizeNearest(img, BW, '76')
    expect(img.data[3]).toBe(128)
  })
})

describe('quantizeOrdered', () => {
  it('出力は必ずパレット色のみ', () => {
    const img = quantizeOrdered(solid(8, 8, 128, 128, 128), BW, '76', 4, 1)
    expect(allInPalette(img, paletteKeys(BW))).toBe(true)
  })
  it('中間グレーは2色ディザで黒白が混在する', () => {
    const img = quantizeOrdered(solid(8, 8, 128, 128, 128), BW, '76', 4, 1)
    const set = new Set<string>()
    for (let i = 0; i < img.data.length; i += 4) set.add(`${img.data[i]}`)
    expect(set.size).toBe(2) // 黒(0)と白(255)が両方出る
  })
  it('strength=0 は最近色のみ（ディザ無し=単一色）', () => {
    const img = quantizeOrdered(solid(8, 8, 128, 128, 128), BW, '76', 4, 0)
    const set = new Set<string>()
    for (let i = 0; i < img.data.length; i += 4) set.add(`${img.data[i]}`)
    expect(set.size).toBe(1)
  })
})

describe('quantizeFloydSteinberg', () => {
  it('出力は必ずパレット色のみ・寸法保持', () => {
    const img = quantizeFloydSteinberg(solid(8, 8, 128, 128, 128), BW, '76', 1, true)
    expect(img.width).toBe(8)
    expect(img.height).toBe(8)
    expect(allInPalette(img, paletteKeys(BW))).toBe(true)
  })
  it('中間グレーは黒白が混在する', () => {
    const img = quantizeFloydSteinberg(solid(8, 8, 128, 128, 128), BW, '76', 1, false)
    const set = new Set<string>()
    for (let i = 0; i < img.data.length; i += 4) set.add(`${img.data[i]}`)
    expect(set.size).toBe(2)
  })
})

describe('bayerMatrix', () => {
  it('2x2 の正規化閾値', () => {
    const m = bayerMatrix(2)
    expect(m.size).toBe(2)
    // raw [[0,2],[3,1]] → (v+0.5)/4
    expect(m.threshold[0][0]).toBeCloseTo(0.125)
    expect(m.threshold[0][1]).toBeCloseTo(0.625)
    expect(m.threshold[1][0]).toBeCloseTo(0.875)
    expect(m.threshold[1][1]).toBeCloseTo(0.375)
  })
  it('8x8 は全64値がユニーク', () => {
    const m = bayerMatrix(8)
    const vals = new Set<number>()
    m.threshold.forEach((row) => row.forEach((v) => vals.add(Math.round(v * 64))))
    expect(vals.size).toBe(64)
  })
})
