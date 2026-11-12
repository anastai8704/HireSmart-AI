import { safeHttpUrl } from "../../lib/safeUrl";

/**
 * Browsers block window.open after an await. The caller opens a blank window synchronously on click, then points it
 * at the URL once the server has authorised it. Returns false when the window was blocked, so the UI can show a link.
 */
export const openPreparedWindow = (win, url) => {
  const safe = safeHttpUrl(url);
  if (!safe || !win || win.closed) return false;
  win.opener = null;
  win.location.href = safe;
  return true;
};

export const prepareWindow = () => (typeof window === "undefined" ? null : window.open("about:blank", "_blank"));
