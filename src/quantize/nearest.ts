// ニアレストネイバー（ディザなし）: 各画素を Lab 最近色へ置換。バンディング比較の基準。
import type { PixelImage, Palette } from '../types'
import type { DeltaMode } from '../color/delta'
import { rgbToLab } from '../color/space'
import { nearestIndex } from './match'

export function quantizeNearest(img: PixelImage, palette: Palette, deltaMode: DeltaMode): PixelImage {
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lab = rgbToLab(d[i], d[i + 1], d[i + 2])
    const c = palette.colors[nearestIndex(lab, palette, deltaMode)]
    d[i] = c.r
    d[i + 1] = c.g
    d[i + 2] = c.b
    // アルファは保持
  }
  return img
}
