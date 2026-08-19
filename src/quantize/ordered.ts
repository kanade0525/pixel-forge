// 組織的ディザリング（ベイヤー行列）。任意パレット対応の正攻法として、
// 各画素で最も近い2色 c1,c2 を求め、画素が c1→c2 の線分上どこに乗るか(t)を計算し、
// ベイヤー閾値と比較して2色を振り分ける。誤差を溜めないためタイル境界でも安定。
import type { PixelImage, Palette, BayerSize } from '../types'
import type { DeltaMode } from '../color/delta'
import { rgbToLab } from '../color/space'
import { twoNearestIndices } from './match'
import { bayerMatrix } from './bayer'

export function quantizeOrdered(
  img: PixelImage,
  palette: Palette,
  deltaMode: DeltaMode,
  bayerSize: BayerSize,
  strength: number
): PixelImage {
  const d = img.data
  const w = img.width
  const { threshold, size } = bayerMatrix(bayerSize)
  const s = clamp01(strength)

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const lab = rgbToLab(d[i], d[i + 1], d[i + 2])
      const [i1, i2] = twoNearestIndices(lab, palette, deltaMode)
      const c1 = palette.colors[i1]
      const c2 = palette.colors[i2]

      let chosen = c1
      if (i1 !== i2) {
        // c1→c2 への Lab 上の射影比率 t を求める
        const dLa = c2.lab.L - c1.lab.L
        const daa = c2.lab.a - c1.lab.a
        const dba = c2.lab.b - c1.lab.b
        const denom = dLa * dLa + daa * daa + dba * dba
        let t = 0
        if (denom > 1e-9) {
          t =
            ((lab.L - c1.lab.L) * dLa + (lab.a - c1.lab.a) * daa + (lab.b - c1.lab.b) * dba) / denom
        }
        t = clamp01(t)
        const b = threshold[y % size][x % size]
        // strength=0 で閾値1.0(常にc1=最近色), strength=1 で標準の b
        const thresholdEff = 1 - s * (1 - b)
        if (t > thresholdEff) chosen = c2
      }
      d[i] = chosen.r
      d[i + 1] = chosen.g
      d[i + 2] = chosen.b
    }
  }
  return img
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
