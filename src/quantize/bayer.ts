// ベイヤー行列（組織的ディザの閾値マップ）。2x2 / 4x4 / 8x8 を生成し、
// 0..1 に正規化した閾値を返す。
import type { BayerSize } from '../types'

// 2x2 の基底から再帰的に生成: M_{2n} = [[4M+0, 4M+2],[4M+3, 4M+1]]
function generate(n: number): number[][] {
  if (n === 1) return [[0]]
  const half = generate(n / 2)
  const size = n
  const m: number[][] = Array.from({ length: size }, () => new Array(size).fill(0))
  const h = n / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      const base = 4 * half[y][x]
      m[y][x] = base + 0
      m[y][x + h] = base + 2
      m[y + h][x] = base + 3
      m[y + h][x + h] = base + 1
    }
  }
  return m
}

export interface BayerMatrix {
  size: number
  /** 0..1 に正規化した閾値（(value + 0.5) / size^2） */
  threshold: number[][]
}

const cache = new Map<number, BayerMatrix>()

export function bayerMatrix(size: BayerSize): BayerMatrix {
  const cached = cache.get(size)
  if (cached) return cached
  const raw = generate(size)
  const denom = size * size
  const threshold = raw.map((row) => row.map((v) => (v + 0.5) / denom))
  const m: BayerMatrix = { size, threshold }
  cache.set(size, m)
  return m
}
