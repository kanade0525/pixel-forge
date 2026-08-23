import { describe, it, expect } from 'vitest'
import { crc32, makeZip } from './zip'

const enc = new TextEncoder()

describe('crc32', () => {
  it('空データは0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
  it('"123456789" の既知CRC (0xCBF43926)', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926)
  })
  it('"The quick brown fox jumps over the lazy dog" の既知CRC (0x414FA339)', () => {
    expect(crc32(enc.encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })
})

describe('makeZip', () => {
  const read16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
  const read32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

  it('先頭がローカルヘッダ署名 PK\\x03\\x04', () => {
    const zip = makeZip([{ name: 'a.txt', data: enc.encode('hello') }])
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('末尾に EOCD 署名 PK\\x05\\x06 とエントリ数', () => {
    const zip = makeZip([
      { name: 'a.png', data: enc.encode('AAAA') },
      { name: 'b.png', data: enc.encode('BBBB') },
    ])
    // EOCD は末尾22バイト（コメント無し）
    const eocd = zip.length - 22
    expect(Array.from(zip.slice(eocd, eocd + 4))).toEqual([0x50, 0x4b, 0x05, 0x06])
    expect(read16(zip, eocd + 8)).toBe(2) // entries on disk
    expect(read16(zip, eocd + 10)).toBe(2) // total entries
  })

  it('中央ディレクトリのオフセット/サイズが整合する', () => {
    const zip = makeZip([{ name: 'x.bin', data: new Uint8Array([1, 2, 3, 4, 5]) }])
    const eocd = zip.length - 22
    const cdSize = read32(zip, eocd + 12)
    const cdOffset = read32(zip, eocd + 16)
    // 中央ディレクトリは cdOffset から始まり cdSize バイト、その後 EOCD。
    expect(cdOffset + cdSize).toBe(eocd)
    // その位置が中央ディレクトリ署名 PK\x01\x02
    expect(Array.from(zip.slice(cdOffset, cdOffset + 4))).toEqual([0x50, 0x4b, 0x01, 0x02])
  })

  it('格納データがローカルヘッダ直後にそのまま入る（store）', () => {
    const data = enc.encode('PIXELFORGE')
    const zip = makeZip([{ name: 'n', data }])
    // ローカルヘッダ=30バイト + ファイル名1バイト の直後にデータ
    const dataStart = 30 + 1
    expect(new TextDecoder().decode(zip.slice(dataStart, dataStart + data.length))).toBe('PIXELFORGE')
  })
})
