import { Navigate, useLocation } from "react-router-dom";
import { useMe } from "@/hooks/useAuth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) {
    return <div className="login-shell muted">Загрузка…</div>;
  }

  if (!data?.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
