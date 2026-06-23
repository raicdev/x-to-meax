# x-to-meax Wiki

x-to-meax は、Xの投稿をMeaxへ自動転送するツールです。

## Pages

- [Setup](Setup.md)
- [Configuration](Configuration.md)
- [Sources](Sources.md)
- [Self-host API](Self-host-API.md)
- [Media](Media.md)
- [Operation](Operation.md)

## Important notes

- `.env` と `data/state.json` はGitにコミットしないでください。
- Meax token、X cookie、ログイン情報をスクリーンショットやログで共有しないでください。
- 常時転送するには `bun run start` のプロセスを動かし続ける必要があります。
