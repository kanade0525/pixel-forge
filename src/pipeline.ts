// 変換パイプライン: 読込済み画像 → 縮小 → 量子化(選択手法) → 出力。
// Canvas 非依存（PixelImage のみ）でテスト可能。
import type { PixelImage, ConvertOptions } from './types'
import { downscale } from './downscale/downscale'
import { quantizeNearest } from './quantize/nearest'
import { quantizeOrdered } from './quantize/ordered'
import { quantizeFloydSteinberg } from './quantize/floyd-steinberg'

export function convert(src: PixelImage, opts: ConvertOptions): PixelImage {
  if (opts.palette.colors.length === 0) {
    throw new Error('パレットに色がありません')
  }
  const small = downscale(src, opts.targetW, opts.targetH, opts.downscale)

  switch (opts.dither) {
    case 'ordered':
      return quantizeOrdered(small, opts.palette, opts.deltaMode, opts.bayerSize, opts.strength)
    case 'fs':
      return quantizeFloydSteinberg(
        small,
        opts.palette,
        opts.deltaMode,
        opts.strength,
        opts.serpentine
      )
    case 'none':
    default:
      return quantizeNearest(small, opts.palette, opts.deltaMode)
  }
}
