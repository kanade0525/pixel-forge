import { describe, it, expect } from 'vitest'
import { createImage } from '../types'
import type { PixelImage, EffectOptions } from '../types'
import {
  adjustBrightnessContrast,
  posterize,
  mosaic,
  toner,
  cartoon,
  applyEffects,
  hasAnyEffect,
  NEUTRAL_EFFECTS,
} from './effects'

// 単色で塗りつぶした画像を作る
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
function px(img: PixelImage, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
}

describe('adjustBrightnessContrast', () => {
  it('0,0 は無変化', () => {
    const img = solid(2, 2, 100, 120, 140)
    adjustBrightnessContrast(img, 0, 0)
    expect(px(img, 0, 0)).toEqual([100, 120, 140, 255])
  })
  it('輝度＋で明るくなる', () => {
    const img = solid(1, 1, 100, 100, 100)
    adjustBrightnessContrast(img, 50, 0)
    expect(px(img, 0, 0)[0]).toBeGreaterThan(100)
  })
  it('コントラスト-100 で中間灰色(128)へ寄る', () => {
    const img = solid(1, 1, 10, 200, 60)
    adjustBrightnessContrast(img, 0, -100)
    const [r, g, b] = px(img, 0, 0)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
  })
})

describe('posterize', () => {
  it('levels<2 は無変化', () => {
    const img = solid(1, 1, 123, 45, 200)
    posterize(img, 1)
    expect(px(img, 0, 0)).toEqual([123, 45, 200, 255])
  })
  it('2段階は各チャンネルが0か255になる', () => {
    const img = solid(1, 1, 100, 130, 200)
    posterize(img, 2)
    for (const v of px(img, 0, 0).slice(0, 3)) {
      expect(v === 0 || v === 255).toBe(true)
    }
  })
})

describe('mosaic', () => {
  it('cell<2 は無変化', () => {
    const img = solid(2, 2, 10, 20, 30)
    img.data[0] = 250 // 1px だけ変える
    mosaic(img, 1)
    expect(img.data[0]).toBe(250)
  })
  it('2×2ブロックが平均色で均一になる', () => {
    const img = createImage(2, 2)
    // R を 0,100,100,100 に → 平均 75
    const rs = [0, 100, 100, 100]
    for (let p = 0; p < 4; p++) {
      img.data[p * 4] = rs[p]
      img.data[p * 4 + 3] = 255
    }
    mosaic(img, 2)
    const r0 = img.data[0]
    expect(r0).toBe(75)
    // 全画素が同じ値
    expect(img.data[4]).toBe(r0)
    expect(img.data[8]).toBe(r0)
    expect(img.data[12]).toBe(r0)
  })
})

describe('toner', () => {
  it('0 は無変化', () => {
    const img = solid(4, 4, 120, 120, 120)
    toner(img, 0)
    expect(px(img, 0, 0)).toEqual([120, 120, 120, 255])
  })
  it('暗めのグレーは一部の画素（インク）が暗くなる', () => {
    // 網点の閾値に対して一部がインクになる中間輝度を使う
    const img = solid(4, 4, 90, 90, 90)
    toner(img, 100)
    let darkened = 0
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (px(img, x, y)[0] < 90) darkened++
    expect(darkened).toBeGreaterThan(0)
    expect(darkened).toBeLessThan(16) // 全部ではない（網点になっている）
  })
})

describe('cartoon', () => {
  it('0 は無変化', () => {
    const img = solid(4, 4, 200, 200, 200)
    cartoon(img, 50)
    // 単色でエッジが無い → 変化なし
    expect(px(img, 2, 2)).toEqual([200, 200, 200, 255])
  })
  it('明暗の境界に暗い輪郭が入る', () => {
    // 左半分 黒、右半分 白の縦エッジ
    const img = createImage(4, 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const v = x < 2 ? 0 : 255
        const i = (y * 4 + x) * 4
        img.data[i] = v
        img.data[i + 1] = v
        img.data[i + 2] = v
        img.data[i + 3] = 255
      }
    }
    cartoon(img, 80)
    // 白側の境界画素(x=2)が暗くなる（輪郭）
    expect(px(img, 2, 1)[0]).toBeLessThan(255)
  })
})

describe('applyEffects / hasAnyEffect', () => {
  it('中立値は加工なし＝同じ参照を返す', () => {
    const img = solid(3, 3, 50, 60, 70)
    expect(hasAnyEffect(NEUTRAL_EFFECTS)).toBe(false)
    expect(applyEffects(img, NEUTRAL_EFFECTS)).toBe(img)
  })
  it('有効な加工があると新しい画像を返し、入力は不変', () => {
    const img = solid(3, 3, 50, 60, 70)
    const e: EffectOptions = { ...NEUTRAL_EFFECTS, brightness: 40 }
    expect(hasAnyEffect(e)).toBe(true)
    const out = applyEffects(img, e)
    expect(out).not.toBe(img)
    expect(px(img, 0, 0)).toEqual([50, 60, 70, 255]) // 入力は変わらない
    expect(px(out, 0, 0)[0]).toBeGreaterThan(50)
  })
})
