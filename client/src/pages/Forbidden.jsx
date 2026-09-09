import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import Button from "../components/ui/Button";
import { useAuth } from "../context/useAuth";
const Forbidden = () => {
  const auth = useAuth();
  const home =
    auth.role === "admin"
      ? "/app/admin"
      : auth.organizationId
        ? `/app/o/${auth.organizationId}`
        : "/app/candidate";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-danger-50">
        <ShieldAlert className="h-8 w-8 text-danger-500" />
      </span>
      <h1 className="mt-5 text-2xl font-bold">Access denied</h1>
      <p className="mt-2 max-w-md text-sm text-ink-500">
        Your current role does not have permission to view this resource. The server remains the
        authority for every protected action.
      </p>
      <Button as={Link} to={home} className="mt-7">
        Return to workspace
      </Button>
    </main>
  );
};
export default Forbidden;
