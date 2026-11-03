// Shared context object so Toast.jsx and useToast.js export only components.

import { createContext } from "react";

export const ToastContext = createContext(null);

export default ToastContext;
