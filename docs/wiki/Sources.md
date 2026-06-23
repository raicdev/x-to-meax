# Sources

## Nitter RSS

デフォルトの取得元です。

```env
NITTER_SOURCE=rss
NITTER_BASE_URL=https://nt.vern.cc
```

実際の取得URLは `NITTER_BASE_URL/<username>/rss` です。

RSS URLを直接指定することもできます。

```env
NITTER_RSS_URL=https://nitter.net/elonmusk/rss
```

`NITTER_RSS_URL` を入れた場合は、`X_USERNAME` ではなくそのURLを使います。

## Nitter HTML

RSSの更新が遅い場合は、プロフィールHTMLを直接スクレイプできます。

```env
NITTER_SOURCE=html
NITTER_HTML_URL=https://nitter.net/elonmusk
```

HTML取得では cache-bust query と no-cache 系ヘッダーを付けます。

## Self-host API

Nitter RSS/HTMLの代わりに、このリポジトリのAPIを取得元にできます。

```env
NITTER_SOURCE=api
TWEETS_API_BASE_URL=http://127.0.0.1:3000
TWEETS_API_LIMIT=100
```

詳細は [Self-host API](Self-host-API.md) を参照してください。

## Diagnostics

RSSだけ診断:

```powershell
bun run debug:rss
```

HTMLスクレイプ側を診断:

```powershell
bun run debug:html
```

一時的にURLを指定する例:

```powershell
$env:NITTER_RSS_URL="https://nitter.net/rai_dev/rss"
bun run debug:rss
Remove-Item Env:NITTER_RSS_URL
```

## Limitations

- Nitter RSS/HTMLはメディア非対応です。画像添付が必要な場合は self-host API を使ってください。
- Nitterだけでは完全なreply情報が取れないため、先頭メンションの通常投稿もreply扱いになる可能性があります。
