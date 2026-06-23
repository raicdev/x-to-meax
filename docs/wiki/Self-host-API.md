# Self-host API

## 概要

`bun run api` で、このサーバー自身がXのGraphQL endpointへアクセスしてユーザー投稿をJSONで返すHTTP APIを起動できます。public Nitter instanceは使いません。

Nitter backendと同じく、Xへアクセスするためにログイン済みアカウントのcookie値が必要です。

## X cookieを設定する

ブラウザで `https://x.com/` にログインし、DevToolsのApplication/Storageからcookieの `auth_token` と `ct0` を確認して `.env` に入れます。

```env
X_AUTH_TOKEN=auth_tokenの値
X_CT0=ct0の値
```

`X_AUTH_TOKEN` と `X_CT0` はログイン情報に近い秘密情報です。公開しないでください。

## APIを起動する

```powershell
bun run api
```

取得例:

```powershell
curl "http://localhost:3000/api/users/elonmusk/tweets"
```

## Query parameters

- `limit=20`: 返す件数です。上限は `API_MAX_LIMIT` です。
- `since_id=1870000000000000000`: 指定IDより新しい投稿だけ返します。
- `include_replies=false`: replyを除外します。
- `include_reposts=false`: repostを除外します。
- `with_replies=true`: Xの「Posts & replies」相当のtimelineを取得します。
- `cursor=...`: 前回レスポンスの `nextCursor` を指定して次ページを取得します。
- `order=asc|desc`: 並び順です。デフォルトは新しい順の `desc` です。

## Response example

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

`nextCursor` は古い投稿へさらに遡るためのページネーション用トークンです。Meax転送用途では通常使いません。

## Meax転送でself-host APIを使う

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

## メディア

self-host API取得元の投稿に画像が含まれる場合は、デフォルトでMeaxの `media` field に添付します。

```env
FORWARD_IMAGES=true
MAX_MEDIA_ATTACHMENTS=4
```

不要な場合:

```env
FORWARD_IMAGES=false
```

Nitter RSS/HTML取得元はメディア非対応です。画像をMeaxへ添付したい場合は `NITTER_SOURCE=api` を使ってください。動画添付は未対応です。

## x-client-transaction-id

`X_CLIENT_TRANSACTION_ID=auto` の場合、Nitterと同じようにペア辞書を取得して `x-client-transaction-id` を生成します。固定値を試したい場合だけ `X_CLIENT_TRANSACTION_ID` に直接入れてください。

## 注意

インターネットに公開する場合は、このAPI自体にも認証やIP制限を付けてください。X側の非公式GraphQL endpointやquery idは変更されることがあり、その場合は `X_BEARER_TOKEN` や実装内のendpoint id更新が必要になります。
