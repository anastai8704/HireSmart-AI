import { useEffect, useState } from "react";
/** Debounces rapidly changing filters while TanStack Query owns request state and cancellation. */
export const useDebouncedValue = (value, delay = 350) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
};
