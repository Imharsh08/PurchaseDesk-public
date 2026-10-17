/**
 * One of the app's own files ("/api/documents/12") as a Blob, e.g. an attached invoice copy to read.
 * Same origin with the session cookie here; the web app replaces this module (web/src/shims/app-file.ts)
 * with one that asks the API with its session token.
 */
export async function fetchAppFile(path: string): Promise<Blob> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(res.status === 404 ? "This file is no longer available." : `Couldn't open the file (${res.status}).`);
  return res.blob();
}
