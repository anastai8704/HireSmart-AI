import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "../ui/States";
import { useAuth } from "../../context/useAuth";
export const ProtectedRoute = ({ roles = [], membershipRoles = [] }) => {
  const auth = useAuth(); const location = useLocation();
  if (auth.isLoading) return <LoadingState message="Restoring your secure session…" />;
  if (!auth.isAuthenticated) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  if (roles.length && !roles.includes(auth.role)) return <Navigate to="/forbidden" replace />;
  if (membershipRoles.length && !membershipRoles.includes(auth.membership?.role)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
};
export const PublicOnlyRoute = () => { const auth = useAuth(); if (auth.isLoading) return <LoadingState />; if (auth.isAuthenticated) return <Navigate to={auth.role === "admin" ? "/app/admin" : auth.role === "candidate" && !auth.organization ? "/app/candidate" : `/app/o/${auth.organizationId}`} replace />; return <Outlet />; };
export default ProtectedRoute;
