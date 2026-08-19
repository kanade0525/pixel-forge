import { describe, it, expect } from 'vitest'
import { parsePaletteText } from './parse'

describe('parsePaletteText', () => {
  it('HEXリスト（改行区切り, #有無混在）', () => {
    const pal = parsePaletteText('#000000\nffffff\n#ff0000')
    expect(pal).not.toBeNull()
    expect(pal!.colors.length).toBe(3)
    expect(pal!.colors[0]).toMatchObject({ r: 0, g: 0, b: 0 })
    expect(pal!.colors[1]).toMatchObject({ r: 255, g: 255, b: 255 })
    expect(pal!.colors[2]).toMatchObject({ r: 255, g: 0, b: 0 })
  })
  it('カンマ/空白区切りでも読める', () => {
    const pal = parsePaletteText('1a1c2c, 5d275d ef7d57')
    expect(pal!.colors.length).toBe(3)
  })
  it('重複は除去', () => {
    const pal = parsePaletteText('#000000\n#000000\n#ffffff')
    expect(pal!.colors.length).toBe(2)
  })
  it('GIMP .gpl を読める', () => {
    const gpl = `GIMP Palette
Name: Test
Columns: 4
#
  0   0   0	Black
255 255 255	White
255   0   0	Red`
    const pal = parsePaletteText(gpl)
    expect(pal!.colors.length).toBe(3)
    expect(pal!.colors[2]).toMatchObject({ r: 255, g: 0, b: 0 })
  })
  it('空文字は null', () => {
    expect(parsePaletteText('   ')).toBeNull()
  })
})
