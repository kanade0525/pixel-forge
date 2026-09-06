// U²-Net(p) 用の前処理・後処理（Canvas/ONNX 非依存の純粋関数でテスト可能）。
// 推論本体（onnxruntime-web）は backgroundRemoval.ts 側に分離する。
import type { PixelImage } from '../types'

export const MODEL_SIZE = 320
// U²-Net は ImageNet 正規化（RGB）を使う。
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

// マスクの min-max 正規化を行う最小レンジ。これ未満は「ほぼ一様」とみなし生値を使う。
// U²-Net の d0 出力は sigmoid 済み（0..1）なので、生値をそのままアルファに使える。
const MIN_NORMALIZE_SPAN = 0.1

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** 1軸ぶんのリサンプル係数（連続する start..start+weights.length-1 の入力画素に対する重み）。 */
interface Contrib {
  start: number
  weights: Float32Array
}

/**
 * srcLen → dstLen の 1 次元リサンプル係数を作る。
 * 縮小時は面積平均（アンチエイリアス）、拡大時はバイリニア。
 * 縮小でバイリニアの点サンプリングを使うと入力画素の大半を読み飛ばし、
 * 髪や細い枝が激しくエイリアシングしてマスク品質が落ちるため軸ごとに切り替える。
 */
function buildContribs(srcLen: number, dstLen: number): Contrib[] {
  const out: Contrib[] = new Array(dstLen)
  if (dstLen >= srcLen) {
    // 拡大（等倍を含む）: バイリニア
    for (let i = 0; i < dstLen; i++) {
      const c = ((i + 0.5) * srcLen) / dstLen - 0.5
      const i0 = Math.floor(c)
      const f = c - i0
      if (i0 < 0) out[i] = { start: 0, weights: new Float32Array([1]) }
      else if (i0 >= srcLen - 1) out[i] = { start: srcLen - 1, weights: new Float32Array([1]) }
      else out[i] = { start: i0, weights: new Float32Array([1 - f, f]) }
    }
    return out
  }
  // 縮小: 出力画素が覆う入力区間 [s0, s1) の面積平均（端の部分被覆も重みに反映）
  for (let i = 0; i < dstLen; i++) {
    const s0 = (i * srcLen) / dstLen
    const s1 = ((i + 1) * srcLen) / dstLen
    const a = Math.floor(s0)
    const b = Math.min(Math.ceil(s1), srcLen)
    const weights = new Float32Array(b - a)
    const span = s1 - s0
    for (let j = a; j < b; j++) {
      weights[j - a] = (Math.min(s1, j + 1) - Math.max(s0, j)) / span
    }
    out[i] = { start: a, weights }
  }
  return out
}

/**
 * 画像を size×size にリサンプルし、ImageNet 正規化した CHW Float32 配列を返す。
 * 返り値は長さ 3*size*size（[R面, G面, B面] の順）。
 * 横 → 縦の 2 パス（分離可能フィルタ）で、各軸を縮小なら面積平均・拡大ならバイリニアで処理する。
 */
export function toModelInput(img: PixelImage, size: number = MODEL_SIZE): Float32Array {
  const { width: w, height: h, data: d } = img
  const cx = buildContribs(w, size)
  const cy = buildContribs(h, size)

  // 横パス: w×h → size×h（RGB 3ch を行優先で保持）
  const tmp = new Float32Array(size * h * 3)
  for (let y = 0; y < h; y++) {
    const srcRow = y * w * 4
    const dstRow = y * size * 3
    for (let x = 0; x < size; x++) {
      const { start, weights } = cx[x]
      let r = 0
      let g = 0
      let b = 0
      for (let k = 0; k < weights.length; k++) {
        const wk = weights[k]
        const si = srcRow + (start + k) * 4
        r += d[si] * wk
        g += d[si + 1] * wk
        b += d[si + 2] * wk
      }
      const di = dstRow + x * 3
      tmp[di] = r
      tmp[di + 1] = g
      tmp[di + 2] = b
    }
  }

  // 縦パス: size×h → size×size、あわせて ImageNet 正規化して CHW に詰める
  const out = new Float32Array(3 * size * size)
  const plane = size * size
  for (let y = 0; y < size; y++) {
    const { start, weights } = cy[y]
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let k = 0; k < weights.length; k++) {
        const wk = weights[k]
        const si = ((start + k) * size + x) * 3
        r += tmp[si] * wk
        g += tmp[si + 1] * wk
        b += tmp[si + 2] * wk
      }
      const o = y * size + x
      out[o] = (r / 255 - MEAN[0]) / STD[0]
      out[plane + o] = (g / 255 - MEAN[1]) / STD[1]
      out[2 * plane + o] = (b / 255 - MEAN[2]) / STD[2]
    }
  }
  return out
}

/**
 * モデル出力マスク（mw×mh, 任意スケールの実数）を 0..255 のアルファへ。
 * min-max 正規化 → tw×th へバイリニア拡大。
 * ただしマスクがほぼ一様（レンジが MIN_NORMALIZE_SPAN 未満）なときは正規化を行わない。
 * 被写体が画面いっぱいの接写では出力が 0.95..1.0 に収まり、正規化すると
 * わずかに顕著度の低い被写体内部が透明まで引き伸ばされて穴が開く。
 * 逆に被写体が写っていない画像では微小ノイズが 0..255 に拡大されてしまう。
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
  const span = ma - mi
  const normalize = span >= MIN_NORMALIZE_SPAN
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
      const raw = top + (bot - top) * fy
      const v = normalize ? (raw - mi) / span : raw
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
