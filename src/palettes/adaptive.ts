// 画像から最適パレットを自動生成（メディアンカット法）。
// 固定パレットが画像に合わない場合でも、画像内の代表色でドット絵化できるようにする。
// 透明画素は無視して背景色でパレットが汚れないようにする。
import type { Palette, PaletteColor, PixelImage } from '../types'
import { rgbToLab, srgbToLinear } from '../color/space'

function makeColor(r: number, g: number, b: number): PaletteColor {
  return { r, g, b, lab: rgbToLab(r, g, b), lr: srgbToLinear(r), lg: srgbToLinear(g), lb: srgbToLinear(b) }
}

interface Box {
  start: number
  end: number // [start, end)
}

export function medianCutPalette(img: PixelImage, maxColors: number): Palette {
  const d = img.data
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= 8) {
      rs.push(d[i])
      gs.push(d[i + 1])
      bs.push(d[i + 2])
    }
  }
  const n = rs.length
  const N = Math.max(2, Math.min(64, Math.floor(maxColors)))
  if (n === 0) {
    return { id: '__adaptive', name: '自動', colors: [makeColor(0, 0, 0), makeColor(255, 255, 255)] }
  }

  const chan = [rs, gs, bs]
  const idx = Array.from({ length: n }, (_, i) => i)
  let boxes: Box[] = [{ start: 0, end: n }]

  const widestChannel = (box: Box): { channel: number; range: number } => {
    let channel = 0
    let range = -1
    for (let c = 0; c < 3; c++) {
      let mn = 255
      let mx = 0
      for (let k = box.start; k < box.end; k++) {
        const v = chan[c][idx[k]]
        if (v < mn) mn = v
        if (v > mx) mx = v
      }
      if (mx - mn > range) {
        range = mx - mn
        channel = c
      }
    }
    return { channel, range }
  }

  while (boxes.length < N) {
    // 最も色幅の広い箱を分割対象に選ぶ
    let target = -1
    let targetRange = -1
    let targetChan = 0
    boxes.forEach((box, i) => {
      if (box.end - box.start <= 1) return
      const { channel, range } = widestChannel(box)
      if (range > targetRange) {
        targetRange = range
        target = i
        targetChan = channel
      }
    })
    if (target < 0) break // これ以上分割できない（全箱が単一色）

    const box = boxes[target]
    const c = targetChan
    // 対象チャンネルで中央値分割
    const slice = idx.slice(box.start, box.end).sort((a, b) => chan[c][a] - chan[c][b])
    for (let k = 0; k < slice.length; k++) idx[box.start + k] = slice[k]
    const mid = box.start + (slice.length >> 1)
    boxes.splice(target, 1, { start: box.start, end: mid }, { start: mid, end: box.end })
  }

  const colors = boxes.map((box) => {
    let r = 0
    let g = 0
    let b = 0
    const cnt = box.end - box.start
    for (let k = box.start; k < box.end; k++) {
      const j = idx[k]
      r += rs[j]
      g += gs[j]
      b += bs[j]
    }
    return makeColor(Math.round(r / cnt), Math.round(g / cnt), Math.round(b / cnt))
  })
  return { id: '__adaptive', name: `自動 (${colors.length}色)`, colors }
}
