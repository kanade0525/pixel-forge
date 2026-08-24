// 各コントロールの「?」常設ヘルプ（タップで説明のポップオーバー表示）。
// title属性はスマホで出ないため、タッチでも読める説明を全項目に用意する。
// index.html の要素に data-help="キー" を付けると、その隣に「?」ボタンが挿入される。

interface Help {
  title: string
  body: string // 簡単なHTML可（<br>・<b> 等。内容は静的で安全）
}

const HELP: Record<string, Help> = {
  read: {
    title: '画像を読み込む / 白紙から作る',
    body: '写真やイラストを取り込むか、「白紙から作る」で空のキャンバスを用意します。大きすぎる画像は自動で縮小します。<br><b>背景切り抜き（元画像・推奨）</b>：フチに続く一様な背景を透明にしてから変換します（人物やキャラの切り出しに。縮小前に行うと輪郭がきれい）。',
  },
  size: {
    title: '出力サイズ（ドットの粗さ）',
    body: '何マス×何マスのドット絵にするか。<b>小さいほど粗くレトロ</b>、大きいほど細かくなります。目安はタイル16、キャラ32〜64。<b>元のサイズ</b>は縮小せず原寸のまま扱います。',
  },
  palette: {
    title: 'パレット（使う色）',
    body: '画像を「この色だけ」で描き直します。<br><b>画像から自動生成</b>（おすすめ）：その画像に合う色を自動抽出。色数を増やすほど元画像に近く、減らすほどレトロにはっきり。<br><b>ゲーム機風など</b>：Game Boy風等の決まった色。<br><b>自作</b>：HEX（#1a1c2c 等）や GIMP の .gpl を貼り付け。スウォッチ右クリックで色を削除できます。',
  },
  dither: {
    title: '色の混ぜ方（ディザリング）',
    body: '少ない色で中間色（グラデーション）を表現する技法です。<br><b>なし（くっきり）</b>：一番近い色に置換。輪郭がはっきり。<b>小さいドット絵はこれが基本</b>。<br><b>網目（ベイヤー）</b>：規則的な網目模様で中間色を表現。均一でレトロな質感。<br><b>粒状（誤差拡散）</b>：ドットを細かく散らして自然に混色。写真の階調向き。<br>「混ぜ具合」で効き目を調整（0で「なし」と同じ）。',
  },
  detail: {
    title: '詳細設定',
    body: '<b>縮め方</b>：なめらか（平均・写真向きできれい）／かっちり（間引き・輪郭が残る）。<br><b>色の合わせ方</b>：標準（高速）／高精度（やや遅い）。通常は既定のままでOKです。',
  },
  exportpng: {
    title: '書き出し（PNG保存）',
    body: 'ドットを保ったまま拡大して保存します。SNSで見せるなら拡大率は×8前後、ゲーム素材として原寸で使うなら×1。「書き出し寸法」に最終的なピクセル数が出ます。',
  },
  zoom: {
    title: '表示（ズーム／移動）',
    body: '<b>−／＋</b>で拡大縮小、<b>フィット</b>で全体表示。ホイールやピンチでも拡大でき、スペース＋ドラッグや「手のひら」ツールで表示を移動できます。現在の倍率と、カーソル位置のマス座標が右に出ます。',
  },
  bgremove: {
    title: '背景消し（仕上げ）',
    body: 'ドット絵から背景を透明にします。<br><b>フチから</b>：画像のフチに続く一様な背景を消す。<br><b>この色を</b>：いま選んでいる「描く色」に近い色をすべて消す（スポイトで背景色を取ってから押すと確実）。<br>輪郭をきれいにしたいときは、変換タブで元画像に対して行うのがおすすめです。',
  },
  refimg: {
    title: '透かし（下絵）',
    body: '編集中の絵の下に参照画像を薄く敷いて「なぞり描き」できます。<b>元画像</b>＝読み込んだ写真、<b>前のコマ</b>＝直前のフレーム。空コマと合わせると、元の絵を少しずつ動かして描き直す作画に便利です。',
  },
  frames: {
    title: 'コマ（フレーム）',
    body: '同じキャンバスを複数の「コマ」として持てます。<b>コマを複製</b>で前の絵を引き継いで少しずつ動かせばパラパラアニメに。前へ／次へで切替、下のサムネからも移動できます。増やしたコマは「タイルマップ」でそのままタイルとして使えます。',
  },
  animexport: {
    title: 'アニメの取込・保存',
    body: '<b>画像を複数追加</b>：連番画像をまとめてコマにできます。<b>コマを並べて保存</b>：全コマを横1列に並べた1枚のPNG（スプライトシート）。<b>全コマをZIP保存</b>：各コマを個別PNGにしてZIP1つに。',
  },
  tilemap: {
    title: 'タイルマップ',
    body: '作った「コマ」をタイルとして格子に並べ、大きな絵（マップ／シーン）を作ります。下でタイルを選び、マップをクリック／ドラッグで配置、右クリックで消去。タイルの種類は「アニメ」タブでコマを増やすと増えます。',
  },
  ai: {
    title: 'AIで下絵を作る',
    body: '文章から画像を生成し、そのままドット絵化して取り込めます（コマ追加／透かし下絵）。「今の絵を下絵にする」で img2img も可能。生成はサーバー経由で Google Gemini に送信され、利用にはサーバー側のセットアップ（APIキー等）が必要です。',
  },
}

let openPop: HTMLElement | null = null
let openKey = ''

function closePop(): void {
  if (!openPop) return
  openPop.remove()
  openPop = null
  openKey = ''
  document.removeEventListener('pointerdown', onDocDown, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('resize', closePop)
}

function onDocDown(e: Event): void {
  const t = e.target as HTMLElement
  if (openPop && !openPop.contains(t) && !t.classList?.contains('help-toggle')) closePop()
}
function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closePop()
}

function placePop(pop: HTMLElement, btn: HTMLElement): void {
  const r = btn.getBoundingClientRect()
  const w = Math.min(320, window.innerWidth - 16)
  pop.style.width = `${w}px`
  // 一旦表示して高さを測る
  pop.style.left = '0px'
  pop.style.top = '0px'
  const h = pop.offsetHeight
  let top = r.bottom + 8
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - 8 - h)
  let left = r.left
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left))
  pop.style.left = `${left}px`
  pop.style.top = `${top}px`
}

export function initHelp(): void {
  document.querySelectorAll<HTMLElement>('[data-help]').forEach((anchor) => {
    const key = anchor.dataset.help
    if (!key) return
    const h = HELP[key]
    if (!h) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'help-toggle'
    btn.textContent = '?'
    btn.setAttribute('aria-label', `${h.title}の説明`)
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const wasThis = openKey === key
      closePop()
      if (wasThis) return // 同じ「?」の再クリックで閉じる
      const pop = document.createElement('div')
      pop.className = 'help-pop'
      pop.setAttribute('role', 'dialog')
      pop.setAttribute('aria-label', h.title)
      pop.innerHTML = `<div class="help-pop-title">${h.title}</div><div class="help-pop-body">${h.body}</div>`
      document.body.appendChild(pop)
      openPop = pop
      openKey = key
      placePop(pop, btn)
      // 直後のクリック伝播で即閉じしないよう次tickで登録
      setTimeout(() => {
        document.addEventListener('pointerdown', onDocDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('resize', closePop)
      }, 0)
    })
    anchor.appendChild(btn)
  })
}
