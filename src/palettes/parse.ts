// 自作パレットの読込。対応形式:
//  - HEX リスト（1行1色 or 空白/カンマ区切り。"#" 有無どちらも可）
//  - GIMP パレット (.gpl): "R G B name" 行を読む
import type { Palette, PaletteColor } from '../types'
import { hexToPaletteColor } from './palettes'
import { rgbToLab, srgbToLinear } from '../color/space'

// # 付きは 3〜8 桁、# 無しは 6 桁のみ（本文中の数字の誤検出を避ける）
const HEX_RE = /#[0-9a-fA-F]{3,8}\b|\b[0-9a-fA-F]{6}\b/g

/** テキストからパレットを推定して読む（.gpl or hex リスト）。空/色なしなら null。 */
export function parsePaletteText(text: string, name = 'カスタム'): Palette | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (/^GIMP Palette/im.test(trimmed)) {
    const pal = parseGpl(trimmed, name)
    if (pal && pal.colors.length > 0) return pal
  }

  const matches = trimmed.match(HEX_RE)
  if (matches) {
    const colors: PaletteColor[] = []
    const seen = new Set<string>()
    for (const m of matches) {
      let color: PaletteColor
      try {
        color = hexToPaletteColor(m)
      } catch {
        continue // 不正なHEXはスキップ
      }
      const key = `${color.r},${color.g},${color.b}`
      if (seen.has(key)) continue
      seen.add(key)
      colors.push(color)
    }
    if (colors.length > 0) return { id: `custom-${Date.now()}`, name, colors }
  }
  return null
}

function parseGpl(text: string, name: string): Palette | null {
  const lines = text.split(/\r?\n/)
  const colors = []
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue // コメント
    if (/^(GIMP Palette|Name:|Columns:)/i.test(line)) continue
    const m = line.trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/)
    if (!m) continue
    const r = clamp255(+m[1])
    const g = clamp255(+m[2])
    const b = clamp255(+m[3])
    colors.push({
      r,
      g,
      b,
      lab: rgbToLab(r, g, b),
      lr: srgbToLinear(r),
      lg: srgbToLinear(g),
      lb: srgbToLinear(b),
    })
  }
  if (colors.length === 0) return null
  return { id: `custom-${Date.now()}`, name, colors }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

// 単一 hex → PaletteColor を再輸出（UI から使う用途）
export { hexToPaletteColor }
