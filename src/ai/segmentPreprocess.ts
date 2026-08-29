// U²-Net(p) 用の前処理・後処理（Canvas/ONNX 非依存の純粋関数でテスト可能）。
// 推論本体（onnxruntime-web）は backgroundRemoval.ts 側に分離する。
import type { PixelImage } from '../types'

export const MODEL_SIZE = 320
// U²-Net は ImageNet 正規化（RGB）を使う。
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * 画像を size×size にバイリニア縮小し、ImageNet 正規化した CHW Float32 配列を返す。
 * 返り値は長さ 3*size*size（[R面, G面, B面] の順）。
 */
export function toModelInput(img: PixelImage, size: number = MODEL_SIZE): Float32Array {
  const { width: w, height: h, data: d } = img
  const out = new Float32Array(3 * size * size)
  const plane = size * size
  for (let y = 0; y < size; y++) {
    const sy = ((y + 0.5) * h) / size - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    const y0c = clamp(y0, 0, h - 1)
    const y1c = clamp(y0 + 1, 0, h - 1)
    for (let x = 0; x < size; x++) {
      const sx = ((x + 0.5) * w) / size - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      const x0c = clamp(x0, 0, w - 1)
      const x1c = clamp(x0 + 1, 0, w - 1)
      const i00 = (y0c * w + x0c) * 4
      const i01 = (y0c * w + x1c) * 4
      const i10 = (y1c * w + x0c) * 4
      const i11 = (y1c * w + x1c) * 4
      for (let c = 0; c < 3; c++) {
        const top = d[i00 + c] + (d[i01 + c] - d[i00 + c]) * fx
        const bot = d[i10 + c] + (d[i11 + c] - d[i10 + c]) * fx
        const val = top + (bot - top) * fy
        out[c * plane + y * size + x] = (val / 255 - MEAN[c]) / STD[c]
      }
    }
  }
  return out
}

/**
 * モデル出力マスク（mw×mh, 任意スケールの実数）を 0..255 のアルファへ。
 * min-max 正規化 → tw×th へバイリニア拡大。
 */
export function maskToAlpha(
  mask: Float32Array | number[],
  mw: number,
  mh: number,
  tw: number,
  th: number
): Uint8ClampedArray {
  let mi = Infinity
  let ma = -Infinity
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i]
    if (v < mi) mi = v
    if (v > ma) ma = v
  }
  const range = ma - mi || 1
  const alpha = new Uint8ClampedArray(tw * th)
  for (let y = 0; y < th; y++) {
    const sy = ((y + 0.5) * mh) / th - 0.5
    const y0 = Math.floor(sy)
    const fy = sy - y0
    const y0c = clamp(y0, 0, mh - 1)
    const y1c = clamp(y0 + 1, 0, mh - 1)
    for (let x = 0; x < tw; x++) {
      const sx = ((x + 0.5) * mw) / tw - 0.5
      const x0 = Math.floor(sx)
      const fx = sx - x0
      const x0c = clamp(x0, 0, mw - 1)
      const x1c = clamp(x0 + 1, 0, mw - 1)
      const p00 = mask[y0c * mw + x0c]
      const p01 = mask[y0c * mw + x1c]
      const p10 = mask[y1c * mw + x0c]
      const p11 = mask[y1c * mw + x1c]
      const top = p00 + (p01 - p00) * fx
      const bot = p10 + (p11 - p10) * fx
      const v = (top + (bot - top) * fy - mi) / range
      alpha[y * tw + x] = Math.round(clamp(v, 0, 1) * 255)
    }
  }
  return alpha
}

/** アルファマスク（0..255・画素順）を画像に適用（既存アルファと乗算）。新しい画像を返す。 */
export function applyAlphaMask(img: PixelImage, alpha: Uint8ClampedArray | Uint8Array): PixelImage {
  const out: PixelImage = {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  }
  const n = img.width * img.height
  for (let p = 0; p < n; p++) {
    out.data[p * 4 + 3] = Math.round((img.data[p * 4 + 3] * alpha[p]) / 255)
  }
  return out
}
