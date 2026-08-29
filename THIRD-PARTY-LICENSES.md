# サードパーティ表記

本アプリは外部UIフレームワークに依存しません（スタイルは自前実装）。
配色・フォントに関する出典・ライセンス・商標表記を以下に記載します。

## フォント

- **DotGothic16**（© 2020 The DotGothic16 Project Authors / Fontworks Inc.）
  — SIL Open Font License 1.1（OFL）で配布。商用利用可。ライセンス全文は
  `public/fonts/OFL.txt` に同梱。フォーマットを woff2 に変換して自前ホストしています
  （字形の改変はしていません）。
- **Material Symbols Outlined**（© Google）
  — Apache License 2.0 で配布。商用利用可。ライセンス全文は
  `public/fonts/LICENSE-MaterialSymbols.txt` に同梱。可変軸を静的化し、使用アイコンのみ
  subset して woff2 で自前ホスト（`public/fonts/MaterialSymbols.subset.woff2`）。

## AI背景切り抜き（任意機能）

- **ONNX Runtime Web**（© Microsoft）
  — MIT License で配布。商用利用可。ブラウザ内推論エンジンとして使用（依存関係。
  wasm はビルド時に同一オリジンへバンドルし自前配信）。
- **U²-Net（軽量版 `u2netp.onnx`）**（Xie Bin Qin ほか / U-2-Net プロジェクト）
  — Apache License 2.0 で配布。商用利用可。被写体（顕著物体）マスク推定に使用し、
  `public/models/u2netp.onnx` として自前ホスト。モデルの改変はしていません。
  ※ `u2net_portrait` / `u2net_human_seg` 等の非商用データ由来の派生モデルは使用していません。

## パレット配色のクレジット

一部の同梱パレットは各作者のパレットをそのまま収録しています（色値自体は事実データであり
著作権保護の対象外ですが、敬意を表して出典を記載します）。

- PICO-8 パレット — Lexaloffle Games
- Sweetie 16 — GrafxKid
- Endesga 32 — ENDESGA

「Game Boy」「Game Boy Advance」「Super Nintendo」等は任天堂、「PICO-8」は Lexaloffle Games
LLC の商標です。本ツールはこれら各社と提携・公認関係にありません。
