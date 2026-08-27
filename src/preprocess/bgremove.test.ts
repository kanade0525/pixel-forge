import { describe, it, expect } from 'vitest'
import { createImage } from '../types'
import type { PixelImage } from '../types'
import { sampleBorderColor, removeBackgroundSmart } from './bgremove'

// 背景色で塗り、中央に別色の四角い被写体を置く
function subjectOnBg(
  w: number,
  h: number,
  bg: [number, number, number],
  fg: [number, number, number],
  rect: { x: number; y: number; w: number; h: number }
): PixelImage {
  const img = createImage(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const inFg = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
      const c = inFg ? fg : bg
      img.data[i] = c[0]
      img.data[i + 1] = c[1]
      img.data[i + 2] = c[2]
      img.data[i + 3] = 255
    }
  }
  return img
}
const alpha = (img: PixelImage, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]

describe('sampleBorderColor', () => {
  it('中央に被写体があってもフチの背景色を返す', () => {
    const img = subjectOnBg(20, 20, [30, 200, 90], [200, 50, 50], { x: 6, y: 6, w: 8, h: 8 })
    expect(sampleBorderColor(img)).toEqual({ r: 30, g: 200, b: 90 })
  })
})

describe('removeBackgroundSmart', () => {
  it('一様背景を消し、被写体は残す', () => {
    const img = subjectOnBg(20, 20, [30, 200, 90], [200, 50, 50], { x: 6, y: 6, w: 8, h: 8 })
    const removed = removeBackgroundSmart(img, 40)
    expect(removed).toBeGreaterThan(0)
    // フチ（背景）は透明
    expect(alpha(img, 0, 0)).toBe(0)
    expect(alpha(img, 19, 19)).toBe(0)
    // 被写体中心は不透明
    expect(alpha(img, 10, 10)).toBe(255)
  })

  it('被写体がフチに掛かっていても被写体は残る（漏れ防止）', () => {
    // 被写体が左フチに接する
    const img = subjectOnBg(20, 20, [240, 240, 240], [20, 20, 20], { x: 0, y: 8, w: 6, h: 6 })
    removeBackgroundSmart(img, 40)
    expect(alpha(img, 1, 10)).toBe(255) // 左フチに触れる被写体は残る
    expect(alpha(img, 19, 0)).toBe(0) // 背景側は消える
  })

  it('背景と被写体が同系色でも tol 内なら区別できる', () => {
    const img = subjectOnBg(20, 20, [200, 200, 200], [120, 120, 120], { x: 6, y: 6, w: 8, h: 8 })
    removeBackgroundSmart(img, 40) // 差=80 > 40 なので被写体は残る
    expect(alpha(img, 0, 0)).toBe(0)
    expect(alpha(img, 10, 10)).toBe(255)
  })

  it('feather で境界に半透明画素ができる', () => {
    // 背景に近いグレー(中間色)の枠を被写体の外周に置いて、境界に中間アルファが出ることを確認
    const img = createImage(16, 16)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4
        const border = x === 0 || y === 0 || x === 15 || y === 15
        const inSubject = x >= 5 && x <= 10 && y >= 5 && y <= 10
        // 背景=白240、被写体=黒20、外周1pxを背景寄りの中間色(210)にして feather 対象を作る。
        // グレーのRGB距離は|Δ|×√3なので、210は距離≈52で tol(40)〜tolOuter(64) に入る。
        let c = 240
        if (inSubject) c = 20
        else if (x >= 4 && x <= 11 && y >= 4 && y <= 11) c = 210
        void border
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c
        img.data[i + 3] = 255
      }
    }
    removeBackgroundSmart(img, 40, true)
    // どこかに 0<alpha<255 の画素が存在する
    let partial = 0
    for (let p = 0; p < 16 * 16; p++) {
      const a = img.data[p * 4 + 3]
      if (a > 0 && a < 255) partial++
    }
    expect(partial).toBeGreaterThan(0)
  })
})
