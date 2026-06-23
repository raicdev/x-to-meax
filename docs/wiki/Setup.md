# Setup

## 必要なもの

- Bun
- Meaxアカウント
- 監視したいXアカウントのユーザー名

例: `https://x.com/elonmusk` を監視したい場合、ユーザー名は `elonmusk` です。`@` は付けません。

## インストール

```powershell
bun install
Copy-Item .env.example .env
```

`.env` に最低限この2つを入れます。

```env
X_USERNAME=監視したいXユーザー名
MEAX_BEARER_TOKEN=Meaxのtoken
```

## Meax token

Meaxへ投稿するために、ブラウザに保存されているMeax tokenを `.env` に入れます。

1. ブラウザで `https://meax.jp/` を開いてログインします。
2. DevToolsを開きます。
3. Consoleで次を実行します。

```js
copy(localStorage.getItem("token"))
```

`.env` に貼り付けます。

```env
MEAX_BEARER_TOKEN=コピーしたtoken
```

このtokenはログイン情報に近い秘密情報です。公開しないでください。

## .env の更新

`.env.example` に新しい設定が増えた場合は、既存値を上書きせず不足項目だけ追加できます。

```powershell
bun update-env
```
