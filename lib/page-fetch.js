// Run in the service worker: document fetches follow HTTP Link preload headers,
// even when their response HTML is only parsed in an inert template.
export async function fetchPageHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Page unavailable (HTTP ${response.status}). Check access or try again later.`,
      );
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
