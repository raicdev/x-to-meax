# Media

## 対応状況

- self-host API取得元: 画像添付対応。
- Nitter RSS取得元: メディア非対応。
- Nitter HTML取得元: メディア非対応。
- 動画添付: 未対応。

Nitter RSS/HTMLでは、Meaxへ添付するために必要な画像情報を安定して取得しません。そのため本文とリンクだけを転送します。

## 設定

```env
FORWARD_IMAGES=true
MAX_MEDIA_ATTACHMENTS=4
```

画像添付を止める場合:

```env
FORWARD_IMAGES=false
```

## Meaxへの送信方法

画像付き投稿では、X API由来の画像URLを取得し、`Blob` として `FormData` の `media` field に追加します。

```js
form.append("content", content);
form.append("alt", alt);
form.append("media", blob, filename);
```

`content-type: multipart/form-data; boundary=...` は手動で指定しません。`FormData` を `body` に渡すと fetch が自動で設定します。

## Quote posts

quote postは、quote元の本文はコピーしません。Meax本文にはquote元のX URLだけを追記します。
