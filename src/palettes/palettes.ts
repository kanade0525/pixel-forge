// 事前定義の固定少色パレット。GB は史実の4色、GBA/SNES は「当時風の厳選セット」
// （両機は厳密には固定パレットを持たないため、レトロ表現向けの代表色として同梱）。
import type { Palette, PaletteColor } from '../types'
import { rgbToLab, srgbToLinear } from '../color/space'

/**
 * "#rgb" / "#rrggbb" / "#rrggbbaa"（アルファ無視）→ PaletteColor（lab/線形を事前計算）。
 * 不正な HEX は例外を投げる（呼び出し側でフィルタ）。
 */
export function hexToPaletteColor(hex: string): PaletteColor {
  let h = hex.replace('#', '').trim().toLowerCase()
  if (/^[0-9a-f]{3}$/.test(h)) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] // 3桁短縮を展開
  }
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) {
    throw new Error(`不正なHEX: ${hex}`)
  }
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return {
    r,
    g,
    b,
    lab: rgbToLab(r, g, b),
    lr: srgbToLinear(r),
    lg: srgbToLinear(g),
    lb: srgbToLinear(b),
  }
}

export function makePalette(id: string, name: string, hexes: string[]): Palette {
  return { id, name, colors: hexes.map(hexToPaletteColor) }
}

// --- 同梱パレット定義（hex） ---

const GB_DMG = ['0f380f', '306230', '8bac0f', '9bbc0f'] // ゲームボーイ(DMG)緑4色
const GB_POCKET = ['ffffff', 'aaaaaa', '555555', '000000'] // GBポケット風グレースケール4色

// GBA風（やや彩度控えめ・柔らかい16色。当時のLCD表現を意識した厳選セット）
const GBA_ISH = [
  '1b1a2e', '3a3a5c', '5c6784', '8a9bb5',
  'c9d1d9', 'f2ead3', 'e0a24c', 'b5642f',
  '7a3b2e', 'a23e48', 'd76a6a', '4b7d52',
  '6fae5f', '2e6b8a', '4aa3c9', 'c58fb0',
]

// SNES風（鮮やか広色域の16色。当時のRPG表現を意識した厳選セット）
const SNES_ISH = [
  '0a0a1e', '1d2b53', '3b3f8c', '5a8cd6',
  '9bd5ff', 'ffffff', 'ffe9c4', 'f2c14e',
  'e07a3c', 'b5382f', '7a1f2b', '3a7d44',
  '6fd08c', '2fa39b', 'c25da8', '6b3fa0',
]

// 定番: PICO-8 (16)
const PICO8 = [
  '000000', '1D2B53', '7E2553', '008751', 'AB5236', '5F574F', 'C2C3C7', 'FFF1E8',
  'FF004D', 'FFA300', 'FFEC27', '00E436', '29ADFF', '83769C', 'FF77A8', 'FFCCAA',
]

// 定番: Sweetie 16 (GrafxKid)
const SWEETIE16 = [
  '1a1c2c', '5d275d', 'b13e53', 'ef7d57', 'ffcd75', 'a7f070', '38b764', '257179',
  '29366f', '3b5dc9', '41a6f6', '73eff7', 'f4f4f4', '94b0c2', '566c86', '333c57',
]

// 定番: Endesga 32
const ENDESGA32 = [
  'be4a2f', 'd77643', 'ead4aa', 'e4a672', 'b86f50', '733e39', '3e2731', 'a22633',
  'e43b44', 'f77622', 'feae34', 'fee761', '63c74d', '3e8948', '265c42', '193c3e',
  '124e89', '0099db', '2ce8f5', 'ffffff', 'c0cbdc', '8b9bb4', '5a6988', '3a4466',
  '262b44', '181425', 'ff0044', '68386c', 'b55088', 'f6757a', 'e8b796', 'c28569',
]

export const PALETTES: Palette[] = [
  makePalette('gb-dmg', 'Game Boy (DMG) 4色', GB_DMG),
  makePalette('gb-pocket', 'GB Pocket グレー4色', GB_POCKET),
  makePalette('gba-ish', 'GBA風 16色（厳選）', GBA_ISH),
  makePalette('snes-ish', 'SNES風 16色（厳選）', SNES_ISH),
  makePalette('pico8', 'PICO-8 16色', PICO8),
  makePalette('sweetie16', 'Sweetie 16', SWEETIE16),
  makePalette('endesga32', 'Endesga 32', ENDESGA32),
]

export function getPalette(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id)
}
