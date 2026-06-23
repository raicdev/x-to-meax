export class MeaxClient {
  constructor({ bearerToken, postsUrl, fetchImpl = fetch }) {
    this.bearerToken = bearerToken;
    this.postsUrl = postsUrl;
    this.fetch = fetchImpl;
  }

  async createPost({ content, alt = "", mediaUrls = [] }) {
    const form = new FormData();
    form.append("content", content);
    form.append("alt", alt);

    for (const media of mediaUrls.map(normalizeMediaInput).filter(Boolean)) {
      const file = await this.downloadMedia(media);
      form.append("media", file.blob, file.filename);
    }

    const response = await this.fetch(this.postsUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.bearerToken}`,
        accept: "application/json, text/plain, */*"
      },
      body: form
    });

    if (!response.ok) {
      const body = await safeText(response);
      throw new Error(`Meax post failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`);
    }

    return response;
  }

  async downloadMedia(media) {
    const response = await this.fetch(media.url, {
      headers: {
        accept: media.accept || "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      const body = await safeText(response);
      throw new Error(`Meax media download failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`);
    }

    const contentType = response.headers?.get?.("content-type") || media.contentType || "application/octet-stream";
    const blob = new Blob([await response.arrayBuffer()], { type: contentType });
    return {
      blob,
      filename: media.filename || inferFilename(media.url, contentType)
    };
  }
}

function normalizeMediaInput(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return { url: value };
  }
  if (typeof value === "object" && value.url) {
    return value;
  }
  return null;
}

function inferFilename(url, contentType) {
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").filter(Boolean).pop();
    if (name && /\.[a-z0-9]{2,5}$/i.test(name)) {
      return name;
    }
  } catch {
    // Fall through to content-type based filename.
  }

  return `media.${extensionFromContentType(contentType)}`;
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  return "bin";
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
