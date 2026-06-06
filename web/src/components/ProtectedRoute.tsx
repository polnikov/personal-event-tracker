import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useIsRestoring } from "@tanstack/react-query";
import { useMe, rememberAuth, forgetAuth, wasAuthenticated } from "@/hooks/useAuth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isRestoring = useIsRestoring();
  const { data, isLoading, isError } = useMe();
  const location = useLocation();

  // Keep the persistent auth flag in sync with the live auth/me result.
  // A genuine sign-out only happens online, where auth/me resolves to
  // {authenticated:false} (success, not error) — that clears the flag. An
  // offline failure is an *error*, which leaves the flag untouched.
  useEffect(() => {
    if (data?.authenticated === true) rememberAuth();
    else if (data?.authenticated === false) forgetAuth();
  }, [data?.authenticated]);

  // While the persisted React Query cache restores from IndexedDB the auth/me
  // query is paused (fetchStatus "idle"), so isLoading is false even though
  // data hasn't arrived. Hold here so we don't bounce to /login prematurely.
  if (isRestoring) {
    return <div className="login-shell muted">Загрузка…</div>;
  }

  // Live session confirmed (or hydrated from the persisted cache).
  if (data?.authenticated) {
    return <>{children}</>;
  }

  // Couldn't confirm with the server (offline, or the request errored) but we
  // have a remembered session → stay in and run on cached data. This is what
  // makes a cold OFFLINE reload work even when the version buster wiped the
  // persisted auth/me entry. Mutations queue; reads come from cache.
  const offlineOrUnreachable =
    isError || (typeof navigator !== "undefined" && !navigator.onLine);
  if (offlineOrUnreachable && wasAuthenticated()) {
    return <>{children}</>;
  }

  // First online auth check still in flight, no remembered session yet.
  if (isLoading) {
    return <div className="login-shell muted">Загрузка…</div>;
  }

  return <Navigate to="/login" replace state={{ from: location }} />;
}
