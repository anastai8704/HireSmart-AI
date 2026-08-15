/**
 * ToastContext.js
 * -----------------------------------------------------------------------------
 * The React context object shared by <ToastProvider> and useToast().
 * It lives alone so neither of those files has to export a non-component.
 */

import { createContext } from "react";

export const ToastContext = createContext(null);

export default ToastContext;
