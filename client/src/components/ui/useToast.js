// Hook for raising toast notifications (kept separate for Fast Refresh).

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
