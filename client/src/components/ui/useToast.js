/**
 * useToast.js
 * -----------------------------------------------------------------------------
 * The hook for raising toast notifications.
 *
 * Separated from Toast.jsx so that file exports only components, preserving
 * Fast Refresh during development.
 */

import { useContext } from "react";

import { ToastContext } from "./ToastContext";

export const useToast = () => {
    const context = useContext(ToastContext);

    if (!context) {
        throw new Error("useToast must be used inside a <ToastProvider>");
    }

    return context;
};

export default useToast;
