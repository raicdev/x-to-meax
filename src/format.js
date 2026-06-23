export function formatMeaxContent(post, { username, includePostLink }) {
  const link = getPostLink(post, username);
  if (post.isRepost) {
    return link;
  }

  const content = (post.text || "").trim();
  const quote = formatQuote(post.quoted);
  const parts = [];

  if (content) {
    parts.push(content);
  }
  if (includePostLink) {
    parts.push(link);
  }
  if (quote) {
    parts.push(quote);
  }

  return parts.join("\n\n");
}

export function buildPostLink(postId, username) {
  return username ? `https://x.com/${username}/status/${postId}` : `https://x.com/i/status/${postId}`;
}

export function getPostLink(post, username) {
  return convertNitterLinkToXLink(post.link) || normalizeXPostLink(post.link) || buildPostLink(post.id, username);
}

export function buildPostKey(post, username) {
  return getPostLink(post, username) || post.id;
}

function formatQuote(quoted) {
  if (!quoted?.id && !quoted?.link) return "";
  const quoteLink = getPostLink(quoted, quoted.user?.username);
  const quoteText = (quoted.text || "").trim();
  if (!quoteText) {
    return quoteLink;
  }
  return `${quoteText}\n${quoteLink}`;
}

export function convertNitterLinkToXLink(link) {
  if (!link) return null;
  const match = String(link).match(/^https?:\/\/[^/]+\/([^/?#]+)\/status(?:es)?\/(\d+)/);
  if (!match) return null;
  return `https://x.com/${decodeURIComponent(match[1])}/status/${match[2]}`;
}

function normalizeXPostLink(link) {
  if (!link) return null;
  const match = String(link).match(/^https?:\/\/(?:x|twitter)\.com\/([^/?#]+)\/status(?:es)?\/(\d+)/);
  if (!match) return null;
  return `https://x.com/${decodeURIComponent(match[1])}/status/${match[2]}`;
}
