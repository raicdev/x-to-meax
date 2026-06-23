# x-to-meax

Xの投稿をMeaxへ自動転送するツールです。

指定したXアカウントのNitterを定期的に見に行き、新しい投稿があればMeaxに投稿します。X APIは使わないので、Xの開発者登録や有料APIトークンは不要です。

## できること

- Xの通常投稿をMeaxにそのまま転送します。
- repostは本文をコピーせず、元のXポストリンクだけをMeaxに投稿します。
- replyはデフォルトで転送しません。
- 初回起動時は、過去投稿をいきなり大量投稿しないように既読として保存します。
- 2回目以降は、新しく増えた投稿だけを転送します。
- `ETag` / `Last-Modified` を保存し、次回アクセス時に差分確認します。

## 必要なもの

- Bun
- Meaxアカウント
- 監視したいXアカウントのユーザー名

例: `https://x.com/elonmusk` を監視したい場合、ユーザー名は `elonmusk` です。

## セットアップ

まず依存パッケージを入れて、設定ファイルを作ります。

```powershell
bun install
Copy-Item .env.example .env
```

次に `.env` を開いて、最低限この2つを入れます。

```env
X_USERNAME=監視したいXユーザー名
MEAX_BEARER_TOKEN=Meaxのtoken
```

例:

```env
X_USERNAME=elonmusk
MEAX_BEARER_TOKEN=eyJ...
```

`X_USERNAME` に `@` は付けなくて大丈夫です。

## Meaxのtokenをコピーする

Meaxへ投稿するために、ブラウザに保存されているMeaxのtokenを `.env` に入れます。

1. ブラウザで `https://meax.jp/` を開いてログインします。
2. DevToolsを開きます。
   - Chrome/Brave/Edge: `F12` または `Ctrl+Shift+I`
3. `Console` タブを開きます。
4. 次のコマンドを貼り付けてEnterを押します。

```js
copy(localStorage.getItem("token"))
```

これでtokenがクリップボードにコピーされます。

5. `.env` の `MEAX_BEARER_TOKEN=` の右側に貼り付けます。

```env
MEAX_BEARER_TOKEN=コピーしたtoken
```

このtokenはログイン情報に近い秘密情報です。人に見せたり、公開リポジトリに貼ったりしないでください。

## 実行

まずは1回だけチェックします。

```powershell
bun run once
```

初回はデフォルトで転送せず、RSSにある投稿を「もう見た投稿」として保存します。これで古い投稿がまとめてMeaxへ流れるのを防ぎます。

常に動かしておきたい場合は次を実行します。

```powershell
bun run start
```

止めるときはターミナルで `Ctrl+C` を押します。

Meaxへ投稿せず、stateも更新せずに検出結果だけ確認したい場合は dry-run を使います。

```powershell
bun run dry-run
```

## ユーザーツイート取得API

Meaxへ転送せず、このサーバー自身がXのGraphQL endpointへアクセスしてユーザー投稿をJSONで返すHTTP APIとしても起動できます。public Nitter instanceは使いません。

Nitter backendと同じく、Xへアクセスするためにログイン済みアカウントのcookie値が必要です。ブラウザで `https://x.com/` にログインし、DevToolsのApplication/Storageからcookieの `auth_token` と `ct0` を確認して `.env` に入れてください。

```env
X_AUTH_TOKEN=auth_tokenの値
X_CT0=ct0の値
```

```powershell
bun run api
```

起動後、次のように取得できます。

```powershell
curl "http://localhost:3000/api/users/elonmusk/tweets"
```

主なquery parameter:

- `limit=20`: 返す件数です。上限は `API_MAX_LIMIT` です。
- `since_id=1870000000000000000`: 指定IDより新しい投稿だけ返します。
- `include_replies=false`: replyを除外します。
- `include_reposts=false`: repostを除外します。
- `with_replies=true`: Xの「Posts & replies」相当のtimelineを取得します。
- `cursor=...`: 前回レスポンスの `nextCursor` を指定して次ページを取得します。
- `order=asc|desc`: 並び順です。デフォルトは新しい順の `desc` です。

レスポンス例:

```json
{
  "username": "elonmusk",
  "backend": "x-graphql",
  "count": 1,
  "total": 1,
  "limit": 20,
  "nextCursor": "cursor-value",
  "user": {
    "id": "44196397",
    "username": "elonmusk",
    "name": "Elon Musk"
  },
  "tweets": [
    {
      "id": "1870000000000000000",
      "text": "hello",
      "title": "hello",
      "url": "https://x.com/elonmusk/status/1870000000000000000",
      "pubDate": "Mon, 22 Jun 2026 08:00:00 GMT",
      "isReply": false,
      "isRepost": false,
      "isQuote": false,
      "media": []
    }
  ]
}
```

`X_CLIENT_TRANSACTION_ID=auto` の場合、Nitterと同じようにペア辞書を取得して `x-client-transaction-id` を生成します。固定値を試したい場合だけ `X_CLIENT_TRANSACTION_ID` に直接入れてください。

`X_AUTH_TOKEN` と `X_CT0` はログイン情報に近い秘密情報です。インターネットに公開する場合は、このAPI自体にも認証やIP制限を付けてください。X側の非公式GraphQL endpointやquery idは変更されることがあり、その場合は `X_BEARER_TOKEN` や実装内のendpoint id更新が必要になります。

## よく変える設定

`.env` で変更できます。

```env
# 何秒ごとにNitterを確認するか
POLL_INTERVAL_SECONDS=300

# Nitterの取得元。rss または html
NITTER_SOURCE=rss

# 通常投稿にもXのリンクを付ける
INCLUDE_POST_LINK=false

# replyも転送する
FORWARD_REPLIES=false

# RSS取得時のUser-Agent
RSS_USER_AGENT=x-to-meax/0.1.0

# サポートから追加ヘッダーを指定された場合だけ使う
RSS_REQUEST_HEADERS_JSON=

# 初回起動時からRSS内の投稿を転送する
BACKFILL_ON_START=false

# Meaxへ投稿せず、stateも更新せずに確認する
DRY_RUN=false
```

普通は `BACKFILL_ON_START=false` と `FORWARD_REPLIES=false` のままで使うのがおすすめです。`BACKFILL_ON_START=true` にすると、初回取得できた投稿もMeaxへ転送します。

## Nitterが動かないとき

Nitterのインスタンスは止まったり、アクセス制限されることがあります。その場合は別のNitterインスタンスを指定できます。

```env
NITTER_BASE_URL=https://nitter.net
```

RSS URLを直接指定することもできます。

```env
NITTER_RSS_URL=https://nitter.net/elonmusk/rss
```

`NITTER_RSS_URL` を入れた場合は、`X_USERNAME` ではなくそのURLを使います。

RSSの更新が遅い場合は、NitterのプロフィールHTMLを直接スクレイプするモードも使えます。

```env
NITTER_SOURCE=html
```

HTML URLを直接指定することもできます。

```env
NITTER_HTML_URL=https://nitter.net/elonmusk
```

RSSだけ診断したい場合は、Meaxへ投稿せずに次を実行できます。

```powershell
bun run debug:rss
```

HTMLスクレイプ側を診断したい場合は次を実行します。

```powershell
bun run debug:html
```

## Meax転送でself-host APIを使う

Nitter RSS/HTMLの代わりに、このプロジェクトのユーザーツイート取得APIをMeax転送の取得元にできます。この場合、Nitter instanceは使いません。

1つ目のターミナルでAPIを起動します。

```powershell
bun run api
```

2つ目のターミナルで転送側を起動します。

```powershell
$env:NITTER_SOURCE="api"
$env:TWEETS_API_BASE_URL="http://127.0.0.1:3000"
bun run start
```

`.env` に書く場合:

```env
NITTER_SOURCE=api
TWEETS_API_BASE_URL=http://127.0.0.1:3000
TWEETS_API_LIMIT=100
```

`FORWARD_REPLIES=true` の場合、転送側はAPIへ `with_replies=true` を付けて「Posts & replies」相当を取得します。replyを実際にMeaxへ流すかどうかは、既存どおり `FORWARD_REPLIES` で制御します。

API取得元の投稿に画像が含まれる場合は、デフォルトでMeaxの `media` field に添付します。不要な場合は無効にできます。

```env
FORWARD_IMAGES=false
```

添付する画像数の上限も変更できます。

```env
MAX_MEDIA_ATTACHMENTS=4
```

quote postの場合は、本文の末尾にquote元のテキストとX URLを追記します。

PowerShellで一時的にURLを指定して試す例:

```powershell
$env:NITTER_RSS_URL="https://nitter.net/rai_dev/rss"
bun run debug:rss
Remove-Item Env:NITTER_RSS_URL
```

## 仕組み

このツールはデフォルトでは `https://nitter.net/<username>/rss` を定期的に取得します。`NITTER_SOURCE=html` の場合は `https://nitter.net/<username>` を取得し、タイムラインHTML内の投稿を検出します。

Nitter取得時は次のヘッダーを送ります。

- `User-Agent`
- `If-None-Match`
- `If-Modified-Since`

Nitterサーバーから `ETag` や `Last-Modified` が返ってきた場合は、`data/state.json` に保存します。次回取得時に `If-None-Match` / `If-Modified-Since` として送るので、更新されていなければ `304 Not Modified` として軽く済ませられます。

NitterにはX APIのような `since_id` がないため、`data/state.json` に既読投稿も保存して、同じ投稿を何度もMeaxへ送らないようにしています。既読キー内の投稿URLは `https://x.com/<user>/status/<id>` に正規化するので、`NITTER_BASE_URL` を変えても同じ投稿を別物として扱いません。

reply判定は、本文が `@someone` のようなメンションから始まるかどうかで見ています。Nitterだけでは完全なreply情報が取れないため、先頭メンションの通常投稿もreply扱いになる可能性があります。

## 注意

- `.env` と `data/state.json` はGitにコミットしないでください。
- Meaxのtokenを貼ったスクリーンショットやログを共有しないでください。
- PCをスリープしたり、ターミナルを閉じたりすると転送も止まります。
