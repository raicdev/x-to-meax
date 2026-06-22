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

NitterにはX APIのような `since_id` がないため、`data/state.json` に既読投稿も保存して、同じ投稿を何度もMeaxへ送らないようにしています。

reply判定は、本文が `@someone` のようなメンションから始まるかどうかで見ています。Nitterだけでは完全なreply情報が取れないため、先頭メンションの通常投稿もreply扱いになる可能性があります。

## 注意

- `.env` と `data/state.json` はGitにコミットしないでください。
- Meaxのtokenを貼ったスクリーンショットやログを共有しないでください。
- PCをスリープしたり、ターミナルを閉じたりすると転送も止まります。
