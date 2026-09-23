# Jikurabe — 和文フォント用 diff ツール

2つの日本語フォントを重ねて、字形の違いを見比べるツール。
[Tiff](https://winniethemu.github.io/tiff/)（by @winnie_the_mu）に着想を得た、日本語フォント向けの実装です。

## 公開サイト

https://mytkymt.github.io/jikurabe/

## 機能

- **Google Fonts の和文 68 ファミリー**を名前で選択（ウェイトも選択可）。`text=` パラメータで必要な文字だけのサブセットを取得するので軽量
- **PC にインストール済みのフォント**を名前で指定（Chrome / Edge では一覧の読み込みも可）
- **フォントファイル**（.otf / .ttf / .woff / .woff2）を直接開いて比較。ブラウザ内だけで処理され、送信されません
- 重ね表示 / A のみ / B のみ、塗り / 輪郭の切り替え、仮想ボディ・ベースラインのガイド
- 文字ごとの**差分％**（どちらかが塗られた面積のうち、片方だけが塗られた割合）と、グリフ欠落の検出
- 比較状態は URL ハッシュに保存されるので、リンクで共有可能

## 開発

ビルド不要の静的サイトです。

```bash
python3 -m http.server 8765
```

`fonts.js` は `https://fonts.google.com/metadata/fonts` の `subsets` に `japanese` を含むファミリーから生成しています。
