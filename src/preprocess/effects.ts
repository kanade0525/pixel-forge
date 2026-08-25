// 変換前の画像加工（前処理エフェクト）。すべて Canvas 非依存の純粋関数で、
// PixelImage（RGBA）を対象にテスト可能。縮小後の小さい画像に適用してから
// 量子化（パレット減色）へ渡すことで、加工結果がドット絵に反映される。
//
// 適用順（applyEffects）: 輝度/コントラスト → カートゥーン化(輪郭線) →
//   ポスタリゼーション → CCトナー(網点) → モザイク。
// いずれも「中立値」なら何もしない（既定は全オフ＝従来と同じ変換）。
import type { PixelImage, EffectOptions } from '../types'

function clone(img: PixelImage): PixelImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** 輝度・コントラスト調整。brightness/contrast はいずれも -100..100（0=無調整）。 */
export function adjustBrightnessContrast(
  img: PixelImage,
  brightness: number,
  contrast: number
): void {
  if (brightness === 0 && contrast === 0) return
  const bShift = (brightness / 100) * 128 // -128..128
  const cf = 1 + contrast / 100 // -100→0(灰色) …0→1… +100→2
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (d[i] - 128) * cf + 128 + bShift
    d[i + 1] = (d[i + 1] - 128) * cf + 128 + bShift
    d[i + 2] = (d[i + 2] - 128) * cf + 128 + bShift
  }
}

/** ポスタリゼーション: 各チャンネルを levels 段階（2..8）に量子化。levels<2 は無効。 */
export function posterize(img: PixelImage, levels: number): void {
  if (levels < 2) return
  const L = Math.min(8, Math.floor(levels))
  const step = 255 / (L - 1)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(Math.round(d[i] / step) * step)
    d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step)
    d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step)
  }
}

/** モザイク: cell×cell のブロックごとに平均色でまとめる。cell<2 は無効。 */
export function mosaic(img: PixelImage, cell: number): void {
  const c = Math.floor(cell)
  if (c < 2) return
  const { width: w, height: h, data: d } = img
  for (let by = 0; by < h; by += c) {
    for (let bx = 0; bx < w; bx += c) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0
      const yMax = Math.min(by + c, h)
      const xMax = Math.min(bx + c, w)
      for (let y = by; y < yMax; y++) {
        for (let x = bx; x < xMax; x++) {
          const i = (y * w + x) * 4
          r += d[i]
          g += d[i + 1]
          b += d[i + 2]
          a += d[i + 3]
          n++
        }
      }
      r = Math.round(r / n)
      g = Math.round(g / n)
      b = Math.round(b / n)
      a = Math.round(a / n)
      for (let y = by; y < yMax; y++) {
        for (let x = bx; x < xMax; x++) {
          const i = (y * w + x) * 4
          d[i] = r
          d[i + 1] = g
          d[i + 2] = b
          d[i + 3] = a
        }
      }
    }
  }
}

// クラスタ型ディザ行列（4×4）。中心から順に埋まり、丸い網点になる。値 0..15。
const CLUSTER4 = [
  [12, 5, 6, 13],
  [4, 0, 1, 7],
  [11, 3, 2, 8],
  [15, 10, 9, 14],
]

/**
 * CCトナー（網点/ハーフトーン）。暗い領域ほど網点（濃いドット）が密になる印刷風の質感。
 * strength は 0..100（0=オフ）。色相は保ちつつ、ドット部を暗く沈ませて陰影を作る。
 */
export function toner(img: PixelImage, strength: number): void {
  if (strength <= 0) return
  const s = Math.min(100, strength) / 100
  const { width: w, height: h, data: d } = img
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const l = luma(d[i], d[i + 1], d[i + 2]) / 255 // 0..1
      const th = (CLUSTER4[y & 3][x & 3] + 0.5) / 16 // 0..1
      // 明るさが閾値より低い画素は「インク」＝暗く沈める（網点）。
      const ink = l < th
      const mul = ink ? 1 - s : 1
      d[i] = d[i] * mul
      d[i + 1] = d[i + 1] * mul
      d[i + 2] = d[i + 2] * mul
    }
  }
}

/**
 * カートゥーン化（輪郭線）。輝度のSobelエッジをしきい値処理して暗い輪郭を描く。
 * 平坦なセル塗りはこの後のパレット減色が担うため、ここでは輪郭のみ付与する。
 * strength は 0..100（0=オフ）。強いほど細い勾配も輪郭として拾う。
 */
export function cartoon(img: PixelImage, strength: number): void {
  if (strength <= 0) return
  const { width: w, height: h, data: d } = img
  if (w < 3 || h < 3) return
  const s = Math.min(100, strength) / 100
  // 強いほど閾値を下げて輪郭を増やす（30..300 の範囲でマッピング）
  const threshold = 300 - s * 270
  // 輝度グリッドを先に作る（darken のフィードバックを避ける）
  const lum = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    lum[p] = luma(d[i], d[i + 1], d[i + 2])
  }
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y
    return lum[cy * w + cx]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        -at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1)
      const gy =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1)
      const mag = Math.sqrt(gx * gx + gy * gy)
      if (mag > threshold) {
        const i = (y * w + x) * 4
        d[i] *= 0.12
        d[i + 1] *= 0.12
        d[i + 2] *= 0.12
      }
    }
  }
}

/** 中立値（全オフ）。既定＝従来通り加工なし。 */
export const NEUTRAL_EFFECTS: EffectOptions = {
  brightness: 0,
  contrast: 0,
  posterizeLevels: 0,
  cartoon: 0,
  toner: 0,
  mosaic: 1,
}

/** どれか1つでも有効な加工が含まれるか。 */
export function hasAnyEffect(e: EffectOptions): boolean {
  return (
    e.brightness !== 0 ||
    e.contrast !== 0 ||
    e.posterizeLevels >= 2 ||
    e.cartoon > 0 ||
    e.toner > 0 ||
    e.mosaic >= 2
  )
}

/**
 * 全エフェクトをまとめて適用（新しい画像を返す。入力は変更しない）。
 * 何も有効でなければ入力をそのまま返す。
 */
export function applyEffects(img: PixelImage, e: EffectOptions): PixelImage {
  if (!hasAnyEffect(e)) return img
  const out = clone(img)
  adjustBrightnessContrast(out, e.brightness, e.contrast)
  cartoon(out, e.cartoon)
  posterize(out, e.posterizeLevels)
  toner(out, e.toner)
  mosaic(out, e.mosaic)
  return out
}
