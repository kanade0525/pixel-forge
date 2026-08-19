// 色空間変換: sRGB(8bit) ↔ 線形RGB ↔ XYZ ↔ CIELAB(D65)
// パレット最近色マッチングは Lab で行い、知覚的に自然な減色にする。
// 誤差拡散は線形RGBで行うため、線形⇄Lab の直接変換も用意する。

export interface Lab {
  L: number
  a: number
  b: number
}

// D65 基準白（Xn, Yn, Zn）。Y=1 に正規化。
const Xn = 0.95047
const Yn = 1.0
const Zn = 1.08883

const DELTA = 6 / 29
const DELTA_CUBE = DELTA * DELTA * DELTA // δ^3
const DELTA_SQ_3 = 3 * DELTA * DELTA // 3δ^2

/** sRGB 1チャンネル(0..255) → 線形(0..1) */
export function srgbToLinear(c8: number): number {
  const cs = c8 / 255
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}

/** 線形(0..1) → sRGB 1チャンネル(0..255, 丸め) */
export function linearToSrgb(cl: number): number {
  const c = cl <= 0.0031308 ? 12.92 * cl : 1.055 * Math.pow(cl, 1 / 2.4) - 0.055
  return Math.round(clamp01(c) * 255)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** 線形RGB(0..1) → XYZ（sRGB/D65 行列） */
export function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041
  return [x, y, z]
}

function labF(t: number): number {
  return t > DELTA_CUBE ? Math.cbrt(t) : t / DELTA_SQ_3 + 4 / 29
}

/** XYZ → CIELAB */
export function xyzToLab(x: number, y: number, z: number): Lab {
  const fx = labF(x / Xn)
  const fy = labF(y / Yn)
  const fz = labF(z / Zn)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

/** 線形RGB(0..1) → Lab（誤差拡散の作業空間から直接変換する用） */
export function linearRgbToLab(r: number, g: number, b: number): Lab {
  const [x, y, z] = linearRgbToXyz(r, g, b)
  return xyzToLab(x, y, z)
}

/** sRGB(0..255) → Lab（パレット・入力画素の変換用） */
export function rgbToLab(r8: number, g8: number, b8: number): Lab {
  return linearRgbToLab(srgbToLinear(r8), srgbToLinear(g8), srgbToLinear(b8))
}
