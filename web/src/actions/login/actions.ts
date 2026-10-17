// Web app version of src/app/login/actions.ts: signing out forgets this browser's session token.
import { clearToken } from "../../api";

export async function logout() {
  clearToken();
  window.location.assign("/login");
}

/** The web app signs in on its own login screen (web/src/pages/login.tsx). */
export async function login() {
  return { error: "Please sign in from the login screen." };
}
