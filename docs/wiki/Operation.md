# Operation

## Commands

1回だけ確認:

```powershell
bun run once
```

常時転送:

```powershell
bun run start
```

dry-run:

```powershell
bun run dry-run
```

self-host API:

```powershell
bun run api
```

`.env` 更新:

```powershell
bun update-env
```

## 常時動かす場合

`bun run start` はプロセスが動いている間だけpollします。ターミナルを閉じたりPCがスリープすると止まります。

self-host API取得元を使う場合は、2つのプロセスが必要です。

```powershell
bun run api
```

別ターミナル:

```powershell
bun run start
```

## State

既読情報は `data/state.json` に保存します。

- 初回起動時は、デフォルトで取得済み投稿を既読として保存します。
- 2回目以降は、新しく増えた投稿だけを転送します。
- post keyは `https://x.com/<user>/status/<id>` に正規化します。

古い投稿も初回から転送したい場合:

```env
BACKFILL_ON_START=true
```

## Logs

手動でバックグラウンド起動した場合は、必要に応じて stdout/stderr をファイルへリダイレクトしてください。このリポジトリの `data/` は `.gitignore` されています。
