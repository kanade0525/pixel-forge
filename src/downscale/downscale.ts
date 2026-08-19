// 目標サイズへの縮小。
//  - area:   面積平均（ボックスフィルタ）。平均は線形光で行いガンマ補正済みの高品質縮小。
//  - nearest: 最近傍サンプリング（ドット感を残す/高速）。
import type { PixelImage, DownscaleMode } from '../types'
import { srgbToLinear, linearToSrgb } from '../color/space'
import { createImage } from '../types'

export function downscale(
  src: PixelImage,
  targetW: number,
  targetH: number,
  mode: DownscaleMode
): PixelImage {
  const w = Math.max(1, Math.floor(targetW))
  const h = Math.max(1, Math.floor(targetH))
  return mode === 'nearest' ? nearest(src, w, h) : areaAverage(src, w, h)
}

function nearest(src: PixelImage, w: number, h: number): PixelImage {
  const out = createImage(w, h)
  const sx = src.width / w
  const sy = src.height / h
  for (let y = 0; y < h; y++) {
    const syi = Math.min(src.height - 1, Math.floor((y + 0.5) * sy))
    for (let x = 0; x < w; x++) {
      const sxi = Math.min(src.width - 1, Math.floor((x + 0.5) * sx))
      const si = (syi * src.width + sxi) * 4
      const di = (y * w + x) * 4
      out.data[di] = src.data[si]
      out.data[di + 1] = src.data[si + 1]
      out.data[di + 2] = src.data[si + 2]
      out.data[di + 3] = src.data[si + 3]
    }
  }
  return out
}

function areaAverage(src: PixelImage, w: number, h: number): PixelImage {
  const out = createImage(w, h)
  const sw = src.width
  const sh = src.height
  const sxRatio = sw / w
  const syRatio = sh / h

  for (let y = 0; y < h; y++) {
    const y0 = y * syRatio
    const y1 = (y + 1) * syRatio
    const iy0 = Math.floor(y0)
    const iy1 = Math.min(sh, Math.ceil(y1))
    for (let x = 0; x < w; x++) {
      const x0 = x * sxRatio
      const x1 = (x + 1) * sxRatio
      const ix0 = Math.floor(x0)
      const ix1 = Math.min(sw, Math.ceil(x1))

      let rl = 0
      let gl = 0
      let bl = 0
      let a = 0
      let weight = 0
      for (let yy = iy0; yy < iy1; yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy)
        for (let xx = ix0; xx < ix1; xx++) {
          const wx = Math.min(x1, xx + 1) - Math.max(x0, xx)
          const wgt = wx * wy
          if (wgt <= 0) continue
          const si = (yy * sw + xx) * 4
          const alpha = src.data[si + 3] / 255
          // 色は「線形光 × アルファ」で平均（プリマルチプライ）してから割り戻す
          const aw = wgt * alpha
          rl += srgbToLinear(src.data[si]) * aw
          gl += srgbToLinear(src.data[si + 1]) * aw
          bl += srgbToLinear(src.data[si + 2]) * aw
          a += alpha * wgt
          weight += wgt
        }
      }
      const di = (y * w + x) * 4
      if (a > 0) {
        out.data[di] = linearToSrgb(rl / a)
        out.data[di + 1] = linearToSrgb(gl / a)
        out.data[di + 2] = linearToSrgb(bl / a)
      } else {
        out.data[di] = 0
        out.data[di + 1] = 0
        out.data[di + 2] = 0
      }
      out.data[di + 3] = weight > 0 ? Math.round((a / weight) * 255) : 0
    }
  }
  return out
}
