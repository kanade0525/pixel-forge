// 色差 ΔE。既定は ΔE76（Lab ユークリッド, 高速）。CIEDE2000 は高精度・任意選択。
import type { Lab } from './space'

export type DeltaMode = '76' | '2000'

/** ΔE*76: Lab 空間のユークリッド距離（の2乗は distSq76 を使う） */
export function deltaE76(a: Lab, b: Lab): number {
  return Math.sqrt(distSq76(a, b))
}

/** ΔE76 の二乗（最近色探索はこれで十分・sqrt省略で高速） */
export function distSq76(a: Lab, b: Lab): number {
  const dL = a.L - b.L
  const da = a.a - b.a
  const db = a.b - b.b
  return dL * dL + da * da + db * db
}

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

/** CIEDE2000 色差（kL=kC=kH=1）。実装は Sharma et al. の定式に準拠。 */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1
  const { L: L2, a: a2, b: b2 } = lab2

  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2

  const Cbar7 = Math.pow(Cbar, 7)
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625))) // 25^7 = 6103515625

  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)

  const h1p = hueAngle(b1, a1p)
  const h2p = hueAngle(b2, a2p)

  const dLp = L2 - L1
  const dCp = C2p - C1p

  let dhp: number
  if (C1p * C2p === 0) {
    dhp = 0
  } else {
    let diff = h2p - h1p
    if (diff > 180) diff -= 360
    else if (diff < -180) diff += 360
    dhp = diff
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * DEG2RAD) / 2)

  const Lbarp = (L1 + L2) / 2
  const Cbarp = (C1p + C2p) / 2

  let hbarp: number
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p
  } else {
    const diff = Math.abs(h1p - h2p)
    if (diff <= 180) hbarp = (h1p + h2p) / 2
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2
    else hbarp = (h1p + h2p - 360) / 2
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG2RAD) +
    0.24 * Math.cos(2 * hbarp * DEG2RAD) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG2RAD) -
    0.2 * Math.cos((4 * hbarp - 63) * DEG2RAD)

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2))
  const Cbarp7 = Math.pow(Cbarp, 7)
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 6103515625))
  const Lbarp50 = (Lbarp - 50) ** 2
  const Sl = 1 + (0.015 * Lbarp50) / Math.sqrt(20 + Lbarp50)
  const Sc = 1 + 0.045 * Cbarp
  const Sh = 1 + 0.015 * Cbarp * T
  const Rt = -Math.sin(2 * dTheta * DEG2RAD) * Rc

  const termL = dLp / Sl
  const termC = dCp / Sc
  const termH = dHp / Sh
  return Math.sqrt(termL * termL + termC * termC + termH * termH + Rt * termC * termH)
}

function hueAngle(b: number, ap: number): number {
  if (ap === 0 && b === 0) return 0
  let h = Math.atan2(b, ap) * RAD2DEG
  if (h < 0) h += 360
  return h
}
