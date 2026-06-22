export class MeaxClient {
  constructor({ bearerToken, postsUrl, fetchImpl = fetch }) {
    this.bearerToken = bearerToken;
    this.postsUrl = postsUrl;
    this.fetch = fetchImpl;
  }

  async createPost({ content, alt = "" }) {
    const form = new FormData();
    form.append("content", content);
    form.append("alt", alt);

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
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
