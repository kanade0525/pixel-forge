import type { Lab } from './color/space'

/** DOM 非依存の画像バッファ。ブラウザの ImageData と構造互換（そのまま渡せる）。 */
export interface PixelImage {
  width: number
  height: number
  data: Uint8ClampedArray // RGBA 連続
}

export interface RGB {
  r: number
  g: number
  b: number
}

/** パレット1色。lab は探索高速化のため事前計算。 */
export interface PaletteColor extends RGB {
  lab: Lab
  /** 線形RGB(0..1)。誤差拡散の作業空間で使う。 */
  lr: number
  lg: number
  lb: number
}

export interface Palette {
  id: string
  name: string
  colors: PaletteColor[]
}

export type DitherMode = 'none' | 'ordered' | 'fs'
export type DownscaleMode = 'area' | 'nearest'
export type BayerSize = 2 | 4 | 8

/** 変換前の画像加工（前処理エフェクト）。中立値=無加工。 */
export interface EffectOptions {
  /** 輝度 -100..100（0=無調整） */
  brightness: number
  /** コントラスト -100..100（0=無調整） */
  contrast: number
  /** ポスタリゼーション段階 2..8（0/1=オフ） */
  posterizeLevels: number
  /** カートゥーン化(輪郭線) 0..100（0=オフ） */
  cartoon: number
  /** CCトナー(網点) 0..100（0=オフ） */
  toner: number
  /** モザイクのブロックサイズ 2..（1=オフ） */
  mosaic: number
}

export interface ConvertOptions {
  targetW: number
  targetH: number
  downscale: DownscaleMode
  palette: Palette
  dither: DitherMode
  bayerSize: BayerSize
  deltaMode: '76' | '2000'
  /** ディザ強度 0..1（0=ディザ無効相当, 1=最大） */
  strength: number
  /** FS のジグザグ走査（縞アーティファクト低減） */
  serpentine: boolean
  /** 変換前の画像加工。未指定なら加工なし。 */
  effects?: EffectOptions
}

export function createImage(width: number, height: number): PixelImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}
