// パレット最近色マッチング（Lab 空間）。ΔE76（既定・高速）と CIEDE2000（高精度）。
import type { Lab } from '../color/space'
import { distSq76, ciede2000, type DeltaMode } from '../color/delta'
import type { Palette } from '../types'

/** 最近色のインデックスを返す。 */
export function nearestIndex(lab: Lab, palette: Palette, mode: DeltaMode): number {
  const colors = palette.colors
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < colors.length; i++) {
    const d = mode === '2000' ? ciede2000(lab, colors[i].lab) : distSq76(lab, colors[i].lab)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** 最も近い2色のインデックス [i1, i2]（i1 が最近）。組織的ディザで2色補間に使う。 */
export function twoNearestIndices(lab: Lab, palette: Palette, mode: DeltaMode): [number, number] {
  const colors = palette.colors
  let i1 = 0
  let i2 = 0
  let d1 = Infinity
  let d2 = Infinity
  for (let i = 0; i < colors.length; i++) {
    const d = mode === '2000' ? ciede2000(lab, colors[i].lab) : distSq76(lab, colors[i].lab)
    if (d < d1) {
      d2 = d1
      i2 = i1
      d1 = d
      i1 = i
    } else if (d < d2) {
      d2 = d
      i2 = i
    }
  }
  if (colors.length === 1) i2 = i1
  return [i1, i2]
}
