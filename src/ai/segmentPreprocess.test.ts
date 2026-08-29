import { describe, it, expect } from 'vitest'
import { createImage } from '../types'
import type { PixelImage } from '../types'
import { toModelInput, maskToAlpha, applyAlphaMask } from './segmentPreprocess'

function solid(w: number, h: number, r: number, g: number, b: number, a = 255): PixelImage {
  const img = createImage(w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r
    img.data[i + 1] = g
    img.data[i + 2] = b
    img.data[i + 3] = a
  }
  return img
}

describe('toModelInput', () => {
  it('CHWの長さと正規化値が正しい（単色）', () => {
    const img = solid(4, 4, 255, 0, 0) // 赤
    const size = 8
    const t = toModelInput(img, size)
    expect(t.length).toBe(3 * size * size)
    // R面 = (1 - 0.485)/0.229, G面 = (0 - 0.456)/0.224, B面 = (0 - 0.406)/0.225
    const plane = size * size
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 4)
    expect(t[plane]).toBeCloseTo((0 - 0.456) / 0.224, 4)
    expect(t[2 * plane]).toBeCloseTo((0 - 0.406) / 0.225, 4)
  })
})

describe('maskToAlpha', () => {
  it('min-max正規化して0..255に拡大（両端が0と255）', () => {
    // 2x1 のマスク [0.2, 0.8] → 正規化で 0 と 1 → 0 と 255
    const alpha = maskToAlpha(new Float32Array([0.2, 0.8]), 2, 1, 2, 1)
    expect(alpha[0]).toBe(0)
    expect(alpha[1]).toBe(255)
  })
  it('出力サイズが tw*th', () => {
    const alpha = maskToAlpha(new Float32Array([0, 1, 1, 0]), 2, 2, 6, 6)
    expect(alpha.length).toBe(36)
  })
})

describe('applyAlphaMask', () => {
  it('既存アルファと乗算して新画像を返す（入力不変）', () => {
    const img = solid(2, 1, 10, 20, 30, 255)
    const out = applyAlphaMask(img, new Uint8ClampedArray([0, 255]))
    expect(out.data[3]).toBe(0) // 1画素目 透明
    expect(out.data[7]).toBe(255) // 2画素目 不透明
    expect(out).not.toBe(img)
    expect(img.data[3]).toBe(255) // 入力は不変
    // RGBは保持
    expect(out.data[0]).toBe(10)
  })
  it('半透明マスクは乗算される', () => {
    const img = solid(1, 1, 0, 0, 0, 200)
    const out = applyAlphaMask(img, new Uint8ClampedArray([128]))
    expect(out.data[3]).toBe(Math.round((200 * 128) / 255))
  })
})
