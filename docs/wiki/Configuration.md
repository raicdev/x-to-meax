# Configuration

`.env` で設定します。

## Basic

```env
X_USERNAME=監視したいXユーザー名
MEAX_BEARER_TOKEN=Meaxのtoken
MEAX_POSTS_URL=https://api.meax.jp/api/posts
```

## Polling

```env
POLL_INTERVAL_SECONDS=300
BACKFILL_ON_START=false
DRY_RUN=false
STATE_FILE=data/state.json
```

- `POLL_INTERVAL_SECONDS`: 何秒ごとに確認するか。
- `BACKFILL_ON_START`: 初回起動時から取得済み投稿も転送するか。
- `DRY_RUN`: Meax投稿とstate更新をせず検出だけ行うか。
- `STATE_FILE`: 既読stateの保存先。

## Forwarding

```env
FORWARD_REPLIES=false
INCLUDE_X_POST_URL=false
FORWARD_IMAGES=true
MAX_MEDIA_ATTACHMENTS=4
```

- `FORWARD_REPLIES`: replyも転送する。
- `INCLUDE_X_POST_URL`: Meax投稿本文に元のX投稿URLを追記する。
- `FORWARD_IMAGES`: 画像をMeaxに添付する。self-host API取得元のみ有効。
- `MAX_MEDIA_ATTACHMENTS`: 1投稿あたりの最大画像添付数。

`INCLUDE_POST_LINK` は旧名です。互換のため残っていますが、新しく設定する場合は `INCLUDE_X_POST_URL` を使ってください。

## Source

```env
NITTER_SOURCE=rss
```

指定できる値:

- `rss`: Nitter RSS。
- `html`: Nitter profile HTML。
- `api`: self-host API。

詳細は [Sources](Sources.md) と [Self-host API](Self-host-API.md) を参照してください。
