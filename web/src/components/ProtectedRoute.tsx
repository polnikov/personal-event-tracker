import { Navigate, useLocation } from "react-router-dom";
import { useIsRestoring } from "@tanstack/react-query";
import { useMe } from "@/hooks/useAuth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isRestoring = useIsRestoring();
  const { data, isLoading } = useMe();
  const location = useLocation();

  // While the persisted React Query cache is being restored from IndexedDB,
  // PersistQueryClientProvider has already rendered us but the query is paused
  // (fetchStatus "idle"), so isLoading (= isPending && isFetching) is false
  // even though `data` hasn't arrived yet. Without gating on isRestoring we'd
  // momentarily see data=undefined and bounce to /login — which is fatal on a
  // cold OFFLINE reload, where the auth/me refetch can never recover and the
  // user gets stuck on a login screen that errors with "NetworkError" because
  // logging in needs the network. Holding here until restore finishes lets the
  // cached session hydrate first.
  if (isRestoring || isLoading) {
    return <div className="login-shell muted">Загрузка…</div>;
  }

  if (!data?.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
