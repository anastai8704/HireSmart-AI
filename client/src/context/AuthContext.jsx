import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, organizationApi, userApi } from "../lib/api";
import { bootstrapSession, setSessionEndedHandler, tokenStore } from "../lib/apiClient";

const AuthContext = createContext(null);
const ORG_KEY = "hiresmart.organization";

export const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationIdState] = useState(() => localStorage.getItem(ORG_KEY));
  const [status, setStatus] = useState("loading");

  const hydrate = useCallback(async () => {
    const [me, orgs] = await Promise.all([userApi.me(), organizationApi.list()]);
    setUser(me.data); setOrganizations(orgs.data || []);
    const available = orgs.data || [];
    const current = localStorage.getItem(ORG_KEY);
    const selected = available.some((o) => String(o.id) === String(current)) ? current : available[0]?.id || null;
    setOrganizationIdState(selected);
    setStatus("authenticated"); return { user: me.data, organizations: available, organizationId: selected };
  }, []);

  useEffect(() => {
    let active = true;
    setSessionEndedHandler(() => { if (active) { tokenStore.clear(); queryClient.clear(); setUser(null); setOrganizations([]); setStatus("anonymous"); } });
    bootstrapSession().then((token) => token ? hydrate().catch(() => { tokenStore.clear(); setStatus("anonymous"); }) : setStatus("anonymous"));
    return () => { active = false; setSessionEndedHandler(null); };
  }, [hydrate, queryClient]);

  const login = useCallback(async (credentials) => { const response = await authApi.login(credentials); tokenStore.set(response.data.accessToken); return hydrate(); }, [hydrate]);
  const register = useCallback((payload) => authApi.register(payload), []);
  const logout = useCallback(async () => { try { await authApi.logout(); } catch { /* local session still ends */ } tokenStore.clear(); queryClient.clear(); setUser(null); setOrganizations([]); setStatus("anonymous"); }, [queryClient]);
  const setOrganizationId = useCallback((value) => { setOrganizationIdState(value || null); if (value) localStorage.setItem(ORG_KEY, value); else localStorage.removeItem(ORG_KEY); }, []);
  const membership = organizations.find((item) => String(item.id) === String(organizationId)) || null;
  const workspaceRole = membership?.role || (user?.role === "admin" ? "platform_admin" : user?.role);

  const value = useMemo(() => ({ user, organizations, organizationId, organization: membership, membership, role: user?.role, workspaceRole, status, isLoading: status === "loading", isAuthenticated: status === "authenticated", login, register, logout, refresh: hydrate, setOrganizationId }), [user, organizations, organizationId, membership, workspaceRole, status, login, register, logout, hydrate, setOrganizationId]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export default AuthContext;
