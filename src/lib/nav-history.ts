/**
 * Where "back" goes: the pages visited in this tab (kept in sessionStorage), so a page's back link
 * returns to where the user came from — the FMS sheet, Approvals, a PO — not always to its module's
 * list. Going back pops the trail like the browser does, so A → B → back never ping-pongs. Form
 * pages (new / edit / amend / update) are skipped: back from a saved receipt isn't its empty form.
 */
const KEY = "pd_nav";
const MAX = 40;

const read = (): string[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const write = (trail: string[]) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {
    // Storage blocked: back links fall back to their module's list.
  }
};
const pathOf = (url: string) => url.split(/[?#]/)[0];
const isForm = (url: string) => /\/(new|edit|amend|update)(\/|$)/.test(pathOf(url)) || pathOf(url) === "/login";

/** Called on every in-app navigation with the new path (and query). */
export function recordVisit(url: string) {
  const trail = read();
  const path = pathOf(url);
  if (trail.length && pathOf(trail[trail.length - 1]) === path) trail[trail.length - 1] = url;
  else if (trail.length > 1 && pathOf(trail[trail.length - 2]) === path) trail.pop();
  else trail.push(url);
  write(trail);
}

/** The page to go back to from `current`, or null when there's none (opened directly). */
export function backTarget(current: string): string | null {
  const path = pathOf(current);
  const trail = read();
  for (let i = trail.length - 1; i >= 0; i--) {
    const url = trail[i];
    if (pathOf(url) !== path && !isForm(url)) return url;
  }
  return null;
}

const NAMES: Record<string, [string, string]> = {
  "": ["Dashboard", "Dashboard"],
  approvals: ["Approvals", "Approvals"],
  fms: ["FMS tracker", "FMS tracker"],
  reports: ["Reports", "Reports"],
  indents: ["Indents", "Indent"],
  quotations: ["Quotations", "Quotations"],
  "purchase-orders": ["Purchase orders", "Purchase order"],
  "goods-receipts": ["Goods receipts", "Goods receipt"],
  bills: ["Bills", "Bill"],
  stock: ["Stock", "Stock"],
  vendors: ["Vendors", "Vendor"],
  items: ["Items", "Item"],
  users: ["Users", "Users"],
  settings: ["Settings", "Settings"],
};

/** "FMS tracker", "Purchase order", "Approvals" … for a back link's label. */
export function pageName(url: string) {
  const [first = "", second] = pathOf(url).split("/").filter(Boolean);
  const names = NAMES[first];
  if (!names) return "Back";
  return second && /^\d+$/.test(second) ? names[1] : names[0];
}
