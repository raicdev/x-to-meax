export function formatMeaxContent(post, { username, includePostLink }) {
  const link = getPostLink(post, username);
  if (post.isRepost) {
    return link;
  }

  const content = (post.text || "").trim();
  if (!includePostLink) {
    return content;
  }

  return content ? `${content}\n\n${link}` : link;
}

export function buildPostLink(postId, username) {
  return username ? `https://x.com/${username}/status/${postId}` : `https://x.com/i/status/${postId}`;
}

export function getPostLink(post, username) {
  return convertNitterLinkToXLink(post.link) || buildPostLink(post.id, username);
}

export function convertNitterLinkToXLink(link) {
  if (!link) return null;
  const match = String(link).match(/^https?:\/\/[^/]+\/([^/?#]+)\/status(?:es)?\/(\d+)/);
  if (!match) return null;
  return `https://x.com/${decodeURIComponent(match[1])}/status/${match[2]}`;
}
