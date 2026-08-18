import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: (count, error) => count < 2 && ![401, 403, 404, 422, 429].includes(error?.status), refetchOnWindowFocus: false }, mutations: { retry: false } } });
createRoot(document.getElementById("root")).render(<StrictMode><ErrorBoundary><QueryClientProvider client={queryClient}><App /></QueryClientProvider></ErrorBoundary></StrictMode>);
