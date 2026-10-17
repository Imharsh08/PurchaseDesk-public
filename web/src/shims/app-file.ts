/** Stand-in for src/lib/app-file.ts: the app's files come from the API, with the session token. */
import { fetchFileBlob } from "../files";

export async function fetchAppFile(path: string): Promise<Blob> {
  return (await fetchFileBlob(path)).blob;
}
