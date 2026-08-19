import { defineConfig } from 'vite'

// 本番ビルドにのみ厳格な CSP を注入する（dev の HMR/inline を壊さないため build 限定）。
// スウォッチ色をインライン style で設定するため style-src に 'unsafe-inline' が必要。
// 外部通信は一切行わないため connect-src 'none'（プライバシー主張の機械的裏づけ）。
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:", // Vite が小さめフォントを data: URI でインライン化するため許可
  "script-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

export default defineConfig({
  plugins: [
    {
      name: 'inject-csp',
      apply: 'build',
      transformIndexHtml(html) {
        const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
        return html.replace('</title>', `</title>\n    ${tag}`)
      },
    },
  ],
})
