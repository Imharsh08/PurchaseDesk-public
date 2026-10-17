/**
 * File links in the shared screens point at "/api/..." (documents, quotation files, PO PDFs, logos),
 * as in the Next app, where the session cookie travels with them. Here the session is a token, which a
 * plain link or <img> can't send: clicks on such links and such images are fetched through the API
 * with the token instead, then opened, downloaded or shown.
 */
import { API_URL, api, getToken } from "./api";

const isFilePath = (path: string) => path.startsWith("/api/") && !path.startsWith("/api/auth/");

/** A file from the API with the session token: its content and name. */
export async function fetchFileBlob(path: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(res.status === 404 ? "This file is no longer available." : `Couldn't open the file (${res.status}).`);
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? path.split("/").pop() ?? "file";
  return { blob: await res.blob(), name };
}

async function fetchFile(path: string) {
  const { blob, name } = await fetchFileBlob(path);
  return { url: URL.createObjectURL(blob), name };
}

/**
 * "Send email as me" (/api/auth/google/gmail?next=): the API gives a one-minute ticket for the
 * signed-in user, then the browser goes through Google's consent and comes back to ?next.
 */
function connectGmail(next: string | null) {
  api<{ url: string }>("/auth/gmail/ticket", { method: "POST", body: JSON.stringify({ next, return: location.origin }) }).then(
    ({ url }) => location.assign(url),
    (error: Error) => alert(error.message),
  );
}

function onClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || link.origin !== location.origin) return;
  if (link.pathname === "/api/auth/google/gmail") {
    event.preventDefault();
    return connectGmail(new URLSearchParams(link.search).get("next"));
  }
  if (!isFilePath(link.pathname)) return;
  event.preventDefault();
  const path = link.pathname + link.search;
  const download = link.hasAttribute("download") || new URLSearchParams(link.search).has("download");
  // Open the tab now, while the click still counts as the user's: browsers block it after an await.
  const tab = download ? null : window.open("", "_blank");
  fetchFile(path).then(
    ({ url, name }) => {
      if (tab) tab.location.href = url;
      else {
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    (error: Error) => {
      tab?.close();
      alert(error.message);
    },
  );
}

/** <img src="/api/..."> (the logo preview in settings): load it with the token. */
function loadImages(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>('img[src^="/api/"]').forEach((img) => {
    const path = img.getAttribute("src")!;
    if (!isFilePath(path) || img.dataset.apiSrc === path) return;
    img.dataset.apiSrc = path;
    img.removeAttribute("src");
    fetchFile(path).then(({ url }) => (img.src = url), () => {});
  });
}

export function installFileLinks() {
  document.addEventListener("click", onClick);
  loadImages(document);
  new MutationObserver(() => loadImages(document)).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
}
