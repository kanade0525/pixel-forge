import { defineConfig, loadEnv, type Plugin } from 'vite'
import { generateImage, type GenerateRequest } from './src/server/gemini.ts'

// 本番ビルドにのみ厳格な CSP を注入する（dev の HMR/inline を壊さないため build 限定）。
// スウォッチ色をインライン style で設定するため style-src に 'unsafe-inline' が必要。
// AI生成は同一オリジンの /api/generate（Cloudflare Function）経由なので connect-src は 'self' のみ許可。
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:", // Vite が小さめフォントを data: URI でインライン化するため許可
  "script-src 'self' 'wasm-unsafe-eval'", // AI背景切り抜き(onnxruntime-web)の WASM 実行に必要
  "connect-src 'self'", // /api/generate と AIモデル/wasm（すべて同一オリジン）のみ。外部へは張らない。
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

// ローカル開発用に本番の /api/generate と同等のエンドポイントを Vite dev サーバへ載せる。
// キーは .env.local の GEMINI_API_KEY（gitignore 済み）。本番は Cloudflare のシークレット。
function devApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api-generate',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res) => {
        const send = (obj: unknown, status: number) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        if (req.method !== 'POST') return send({ error: 'POST のみ対応しています' }, 405)
        const key = env.GEMINI_API_KEY
        if (!key) return send({ error: '.env.local に GEMINI_API_KEY を設定してください' }, 500)
        if (env.ACCESS_CODE) {
          const provided = (req.headers['x-access-code'] as string | undefined) ?? ''
          if (provided !== env.ACCESS_CODE) {
            return send({ error: 'アクセスコードが必要です（または誤りです）', needCode: true }, 401)
          }
        }
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        let body: GenerateRequest
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as GenerateRequest
        } catch {
          return send({ error: '不正なリクエストです' }, 400)
        }
        const result = await generateImage(key, body, env.GEMINI_IMAGE_MODEL)
        if (!result.ok) return send({ error: result.message }, result.status)
        return send({ image: result.image, mimeType: result.mimeType }, 200)
      })
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '') // すべての env（VITE_ 接頭辞なしも）を読む
  return {
    // GitHub Pages はプロジェクトページ（https://<user>.github.io/pixel-forge/）配下で配信するため
    // ビルド時のみ base をサブパスにする。dev サーバはルート配信のまま。
    base: command === 'build' ? '/pixel-forge/' : '/',
    // onnxruntime-web は動的 import で別チャンク化し、wasm は public/ort を自前参照するため
    // 依存最適化の対象から外す（dev の prebundle 失敗を防ぐ）。
    optimizeDeps: { exclude: ['onnxruntime-web'] },
    plugins: [
      devApiPlugin(env),
      {
        name: 'inject-csp',
        apply: 'build',
        transformIndexHtml(html) {
          const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
          return html.replace('</title>', `</title>\n    ${tag}`)
        },
      },
    ],
  }
})
