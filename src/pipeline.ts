// 変換パイプライン: 読込済み画像 → 縮小 → 量子化(選択手法) → 出力。
// Canvas 非依存（PixelImage のみ）でテスト可能。
import type { PixelImage, ConvertOptions } from './types'
import { downscale } from './downscale/downscale'
import { applyEffects } from './preprocess/effects'
import { quantizeNearest } from './quantize/nearest'
import { quantizeOrdered } from './quantize/ordered'
import { quantizeFloydSteinberg } from './quantize/floyd-steinberg'

// 縮小済み画像に対して量子化のみを行う（自動パレット生成のため縮小を別途行いたい呼び出し用）。
export function quantizeImage(small: PixelImage, opts: ConvertOptions): PixelImage {
  if (opts.palette.colors.length === 0) {
    throw new Error('パレットに色がありません')
  }
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

// 縮小 → 前処理エフェクト を行い、量子化前の小さい画像を返す。
// 自動生成パレットは加工後の色から作りたいので、量子化と分けて公開する。
export function downscaleAndPreprocess(src: PixelImage, opts: ConvertOptions): PixelImage {
  const small = downscale(src, opts.targetW, opts.targetH, opts.downscale)
  return opts.effects ? applyEffects(small, opts.effects) : small
}

export function convert(src: PixelImage, opts: ConvertOptions): PixelImage {
  return quantizeImage(downscaleAndPreprocess(src, opts), opts)
}
