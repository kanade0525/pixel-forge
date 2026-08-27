// 背景切り抜き（古典手法の改良版）。Canvas 非依存の純粋関数でテスト可能。
//
// 旧実装は「隣どうしの色が近ければ連結で消す」だけで、背景にグラデ/影があると
// 被写体まで漏れて消える（または途中で止まって背景が残る）問題があった。
// 改良点:
//  1) フチ画素から背景の基準色 bgRef を推定（中央値＝被写体がフチに触れても頑健）
//  2) フチからの連結フラッドだが「bgRef に近い」画素だけ広げる → 被写体側へ漏れにくい
//  3) 境界をフェザリング（bgRef に近い縁の画素を半透明に）→ ギザギザ/色にじみを低減
//
// ※ これは「背景が概ね一様」な画像に有効。複雑背景の写真は別途AIセグメンテーションが要る。
import type { PixelImage } from '../types'

function dist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

// フチ画素の各チャンネル中央値を背景基準色とする（被写体が一部のフチに触れても頑健）。
export function sampleBorderColor(img: PixelImage): { r: number; g: number; b: number } {
  const { width: w, height: h, data: d } = img
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4
    if (d[i + 3] === 0) return // すでに透明な画素は無視
    rs.push(d[i])
    gs.push(d[i + 1])
    bs.push(d[i + 2])
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  const median = (a: number[]): number => {
    if (a.length === 0) return 0
    a.sort((x, y) => x - y)
    return a[a.length >> 1]
  }
  return { r: median(rs), g: median(gs), b: median(bs) }
}

/**
 * フチから続く背景（基準色に近い連結領域）を透明化。変化した画素数を返す。
 * @param tol 許容色差（RGB距離）。UIの弱/中/強に対応。
 * @param feather 境界を半透明にして滑らかにする（元画像=true 推奨、ドット直接=false）。
 */
export function removeBackgroundSmart(img: PixelImage, tol: number, feather = false): number {
  const { width: w, height: h, data: d } = img
  if (w === 0 || h === 0) return 0
  const bg = sampleBorderColor(img)
  const orig = d.slice()
  const visited = new Uint8Array(w * h)
  const removedMask = new Uint8Array(w * h)
  const stack: number[] = []
  let removed = 0

  const nearBg = (idx: number): boolean =>
    dist(orig[idx * 4], orig[idx * 4 + 1], orig[idx * 4 + 2], bg.r, bg.g, bg.b) <= tol

  const seed = (x: number, y: number) => {
    const idx = y * w + x
    if (visited[idx] || orig[idx * 4 + 3] === 0) return
    visited[idx] = 1
    if (!nearBg(idx)) return // フチでも背景色から離れていれば消さない（被写体がフチに掛かるケース）
    d[idx * 4 + 3] = 0
    removedMask[idx] = 1
    removed++
    stack.push(idx)
  }
  for (let x = 0; x < w; x++) {
    seed(x, 0)
    seed(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    seed(0, y)
    seed(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop()!
    const px = p % w
    const py = (p / w) | 0
    const neigh = [
      [px + 1, py],
      [px - 1, py],
      [px, py + 1],
      [px, py - 1],
    ]
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const n = ny * w + nx
      if (visited[n]) continue
      visited[n] = 1
      if (orig[n * 4 + 3] === 0) continue
      if (nearBg(n)) {
        d[n * 4 + 3] = 0
        removedMask[n] = 1
        removed++
        stack.push(n)
      }
    }
  }

  // 境界フェザリング: 残った画素のうち、消えた画素に隣接し、かつ背景色に近いものを
  // 距離に応じて半透明にする（色にじみ・ギザギザを低減）。
  if (feather) {
    const tolOuter = tol * 1.6
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        if (removedMask[idx] || orig[idx * 4 + 3] === 0) continue
        // 消えた画素に隣接しているか
        const adj =
          (x + 1 < w && removedMask[idx + 1]) ||
          (x - 1 >= 0 && removedMask[idx - 1]) ||
          (y + 1 < h && removedMask[idx + w]) ||
          (y - 1 >= 0 && removedMask[idx - w])
        if (!adj) continue
        const dd = dist(orig[idx * 4], orig[idx * 4 + 1], orig[idx * 4 + 2], bg.r, bg.g, bg.b)
        if (dd >= tolOuter) continue // 背景色から十分遠い＝被写体本体は不透明のまま
        // tol→透明(0), tolOuter→不透明(255) の線形
        const t = (dd - tol) / (tolOuter - tol)
        const a = Math.max(0, Math.min(255, Math.round(t * 255)))
        if (a < orig[idx * 4 + 3]) d[idx * 4 + 3] = a
      }
    }
  }

  return removed
}
