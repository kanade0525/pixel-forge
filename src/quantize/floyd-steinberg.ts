// フロイド–スタインバーグ誤差拡散。作業は線形RGB（エネルギー保存）で行い、
// 色選択のみ Lab 最近色で判定する。serpentine 走査で縞アーティファクトを低減。
// 拡散重み: 右7/16, 左下3/16, 下5/16, 右下1/16。
import type { PixelImage, Palette } from '../types'
import type { DeltaMode } from '../color/delta'
import { srgbToLinear, linearRgbToLab } from '../color/space'
import { nearestIndex } from './match'

export function quantizeFloydSteinberg(
  img: PixelImage,
  palette: Palette,
  deltaMode: DeltaMode,
  strength: number,
  serpentine: boolean
): PixelImage {
  const w = img.width
  const h = img.height
  const d = img.data
  const s = clamp01(strength)

  // 線形RGB float 作業バッファ
  const buf = new Float64Array(w * h * 3)
  for (let p = 0, q = 0; p < d.length; p += 4, q += 3) {
    buf[q] = srgbToLinear(d[p])
    buf[q + 1] = srgbToLinear(d[p + 1])
    buf[q + 2] = srgbToLinear(d[p + 2])
  }

  for (let y = 0; y < h; y++) {
    const ltr = !serpentine || y % 2 === 0 // 左→右 か
    const xStart = ltr ? 0 : w - 1
    const xEnd = ltr ? w : -1
    const step = ltr ? 1 : -1
    for (let x = xStart; x !== xEnd; x += step) {
      const bi = (y * w + x) * 3
      const rl = buf[bi]
      const gl = buf[bi + 1]
      const bl = buf[bi + 2]

      const lab = linearRgbToLab(clamp01(rl), clamp01(gl), clamp01(bl))
      const c = palette.colors[nearestIndex(lab, palette, deltaMode)]

      const pi = (y * w + x) * 4
      d[pi] = c.r
      d[pi + 1] = c.g
      d[pi + 2] = c.b

      // 誤差（線形）× strength を近傍へ拡散
      const er = (rl - c.lr) * s
      const eg = (gl - c.lg) * s
      const eb = (bl - c.lb) * s

      const dir = step // 走査方向に合わせて「右」を反転
      diffuse(buf, w, h, x + dir, y, er, eg, eb, 7 / 16)
      diffuse(buf, w, h, x - dir, y + 1, er, eg, eb, 3 / 16)
      diffuse(buf, w, h, x, y + 1, er, eg, eb, 5 / 16)
      diffuse(buf, w, h, x + dir, y + 1, er, eg, eb, 1 / 16)
    }
  }
  return img
}

function diffuse(
  buf: Float64Array,
  w: number,
  h: number,
  x: number,
  y: number,
  er: number,
  eg: number,
  eb: number,
  wgt: number
): void {
  if (x < 0 || x >= w || y < 0 || y >= h) return
  const bi = (y * w + x) * 3
  buf[bi] += er * wgt
  buf[bi + 1] += eg * wgt
  buf[bi + 2] += eb * wgt
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
