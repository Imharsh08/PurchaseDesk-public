/**
 * Server actions in the web app: the shared screens call the same functions as in the Next app
 * (approvePurchaseOrder(…), saveItem(…)); the web build turns each into callAction(), which runs the
 * real action in the API (api/routes/actions.ts). After a change the screen's data is loaded again —
 * what revalidatePath() does in the Next app — and a redirect() in the action moves to that page.
 */
import { API_URL, ApiError, clearToken, getToken } from "./api";
import { refreshData, reviveDates } from "./data";

type Navigate = (href: string) => void;
let navigate: Navigate = (href) => window.location.assign(href);

/** The app shell hands over React Router's navigate, so redirects stay inside the app. */
export function setActionNavigator(fn: Navigate) {
  navigate = fn;
}

/** JSON body, or multipart when an argument is a FormData (uploads) — see api/routes/actions.ts. */
function encode(args: unknown[]): { body: BodyInit; json: boolean } {
  const forms: FormData[] = [];
  const plain = args.map((a) => (a instanceof FormData ? { $formData: forms.push(a) - 1 } : a));
  if (!forms.length) return { body: JSON.stringify({ args: plain }), json: true };
  const multipart = new FormData();
  multipart.set("__args", JSON.stringify(plain));
  forms.forEach((form, n) => form.forEach((value, key) => multipart.append(`fd${n}:${key}`, value)));
  return { body: multipart, json: false };
}

export async function callAction(module: string, fn: string, args: unknown[]): Promise<unknown> {
  const token = getToken();
  const { body, json } = encode(args);
  const res = await fetch(`${API_URL}/actions/${module}/${fn}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) },
    body,
  });
  const text = await res.text();
  const reply = (text ? JSON.parse(text, reviveDates) : {}) as { result?: unknown; redirect?: string; error?: string };
  if (res.status === 401) {
    clearToken();
    window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  if (!res.ok) throw new ApiError(reply.error ?? `The server answered ${res.status}.`, res.status);
  if (reply.redirect) {
    refreshData();
    navigate(reply.redirect);
    return { ok: true, data: undefined };
  }
  const result = reply.result as { ok?: boolean } | null;
  if (!result || result.ok !== false) refreshData();
  return reply.result;
}
