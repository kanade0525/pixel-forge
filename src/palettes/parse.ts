// 自作パレットの読込。対応形式:
//  - HEX リスト（1行1色 or 空白/カンマ区切り。"#" 有無どちらも可）
//  - GIMP パレット (.gpl): "R G B name" 行を読む
import type { Palette } from '../types'
import { hexToPaletteColor, makePalette } from './palettes'
import { rgbToLab, srgbToLinear } from '../color/space'

const HEX_RE = /#?[0-9a-fA-F]{6}/g

/** テキストからパレットを推定して読む（.gpl or hex リスト）。空なら null。 */
export function parsePaletteText(text: string, name = 'カスタム'): Palette | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (/^GIMP Palette/im.test(trimmed)) {
    const pal = parseGpl(trimmed, name)
    if (pal && pal.colors.length > 0) return pal
  }

  const hexes = trimmed.match(HEX_RE)
  if (hexes && hexes.length > 0) {
    return makePalette(`custom-${Date.now()}`, name, dedupe(hexes.map((h) => h.replace('#', '').toLowerCase())))
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

function dedupe(hexes: string[]): string[] {
  return Array.from(new Set(hexes))
}

// 単一 hex → PaletteColor を再輸出（UI から使う用途）
export { hexToPaletteColor }
