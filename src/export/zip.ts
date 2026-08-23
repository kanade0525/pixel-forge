// 依存なしの最小 ZIP 生成（格納=store, 無圧縮）。
// PNG は既に圧縮済みなので store で十分（サイズはほぼ変わらない）。
// 外部ライブラリを使わないことで、商用配布時のライセンス懸念をなくす。

export interface ZipEntry {
  name: string
  data: Uint8Array
}

// CRC-32（IEEE 802.3 多項式 0xEDB88320）。ZIP の各エントリに必要。
export function crc32(bytes: Uint8Array): number {
  let crc = ~0
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (~crc) >>> 0
}

const u16 = (n: number): Uint8Array => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
const u32 = (n: number): Uint8Array =>
  new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let len = 0
  for (const p of parts) len += p.length
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// 複数ファイルを1つの ZIP（Uint8Array）にまとめる。
export function makeZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    const size = e.data.length

    // ローカルファイルヘッダ + データ
    const local = concat([
      u32(0x04034b50), // signature
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method = 0 (store)
      u16(0), // mod time
      u16(0), // mod date
      u32(crc),
      u32(size), // compressed size
      u32(size), // uncompressed size
      u16(name.length),
      u16(0), // extra length
      name,
      e.data,
    ])
    locals.push(local)

    // 中央ディレクトリヘッダ
    const central = concat([
      u32(0x02014b50), // signature
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method
      u16(0), // mod time
      u16(0), // mod date
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0), // extra length
      u16(0), // comment length
      u16(0), // disk number start
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset), // local header offset
      name,
    ])
    centrals.push(central)

    offset += local.length
  }

  const centralStart = offset
  let centralSize = 0
  for (const c of centrals) centralSize += c.length

  const end = concat([
    u32(0x06054b50), // end of central directory signature
    u16(0), // disk number
    u16(0), // disk with central dir
    u16(entries.length), // entries on this disk
    u16(entries.length), // total entries
    u32(centralSize),
    u32(centralStart),
    u16(0), // comment length
  ])

  return concat([...locals, ...centrals, end])
}
