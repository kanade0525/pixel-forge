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

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/** CHW 正規化済みテンソルから、指定画素の R チャンネルを 0..255 に戻す。 */
function redAt(t: Float32Array, size: number, x: number, y: number): number {
  return (t[y * size + x] * STD[0] + MEAN[0]) * 255
}

/** w×h の黒画像に、指定列だけ白の縦線を引く。 */
function verticalLine(w: number, h: number, col: number): PixelImage {
  const img = createImage(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const v = x === col ? 255 : 0
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
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

  it('縮小時は面積平均で細線が消えない（点サンプリングだと取りこぼす位置）', () => {
    // 64→8 の8倍縮小。列0 の1px 白線は、点サンプリング（中心 x=3.5）だと完全に読み飛ばされる。
    const size = 8
    const t = toModelInput(verticalLine(64, 64, 0), size)
    // 面積平均なら 8列ぶんに均されて 255/8 が残る
    expect(redAt(t, size, 0, 0)).toBeCloseTo(255 / 8, 1)
    // 線の無い列は黒のまま
    expect(redAt(t, size, 1, 0)).toBeCloseTo(0, 1)
  })

  it('縮小しても全体の平均輝度が保たれる', () => {
    const size = 8
    const img = createImage(64, 64)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (i / 4) % 2 === 0 ? 0 : 200 // 市松に近い高周波
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    const t = toModelInput(img, size)
    let sum = 0
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) sum += redAt(t, size, x, y)
    expect(sum / (size * size)).toBeCloseTo(100, 0) // 平均 100
  })

  it('拡大時はバイリニアのまま（端は入力値と一致）', () => {
    const img = createImage(2, 2)
    img.data.set([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255])
    const size = 4
    const t = toModelInput(img, size)
    expect(redAt(t, size, 0, 0)).toBeCloseTo(0, 1)
    expect(redAt(t, size, 3, 0)).toBeCloseTo(255, 1)
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
  it('ほぼ一様な高マスク（被写体が画面いっぱい）は正規化せず不透明を保つ', () => {
    // レンジ 0.05 < 0.1。正規化すると 0.95 が透明まで引き伸ばされ被写体に穴が開く。
    const alpha = maskToAlpha(new Float32Array([0.95, 1.0]), 2, 1, 2, 1)
    expect(alpha[0]).toBe(Math.round(0.95 * 255))
    expect(alpha[1]).toBe(255)
  })
  it('ほぼ一様な低マスク（被写体なし）はノイズを増幅しない', () => {
    const alpha = maskToAlpha(new Float32Array([0.01, 0.03]), 2, 1, 2, 1)
    expect(alpha[0]).toBe(Math.round(0.01 * 255))
    expect(alpha[1]).toBe(Math.round(0.03 * 255))
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
