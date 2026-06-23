# x-to-meax

Xの投稿をMeaxへ自動転送するツールです。

デフォルトではNitter RSSを定期的に確認し、新しい投稿だけをMeaxに投稿します。Xの開発者登録や有料APIトークンは不要です。self-host API取得元を使う場合は、Nitter instanceを使わずにこのサーバー自身がX GraphQLへアクセスします。

## Quick Start

```powershell
bun install
Copy-Item .env.example .env
```

`.env` に最低限この2つを設定します。

```env
X_USERNAME=監視したいXユーザー名
MEAX_BEARER_TOKEN=Meaxのtoken
```

Meax tokenは、MeaxにログインしたブラウザのConsoleで取得できます。

```js
copy(localStorage.getItem("token"))
```

1回だけ確認:

```powershell
bun run once
```

常時転送:

```powershell
bun run start
```

Meaxへ投稿せずに確認:

```powershell
bun run dry-run
```

`.env.example` に新しい項目が増えた場合:

```powershell
bun update-env
```

## Features

- 通常投稿をMeaxへ転送
- repostは元のXポストリンクだけ投稿
- quote postはquote元URLだけ追記
- replyはデフォルトで除外
- 既読stateで重複投稿を防止
- self-host API取得元では画像添付に対応

## Docs

詳細は `docs/wiki` に分けています。

- [Setup](docs/wiki/Setup.md)
- [Configuration](docs/wiki/Configuration.md)
- [Sources](docs/wiki/Sources.md)
- [Self-host API](docs/wiki/Self-host-API.md)
- [Media](docs/wiki/Media.md)
- [Operation](docs/wiki/Operation.md)

## Notes

- `.env` と `data/state.json` はGitにコミットしないでください。
- MeaxやXのtokenを貼ったスクリーンショットやログを共有しないでください。
- PCをスリープしたり、ターミナルを閉じたりすると転送も止まります。
