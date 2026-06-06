import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/api";

// Lightweight "I was authenticated" flag, kept in localStorage so it survives
// reloads independently of the React Query persisted cache (which is wiped on
// every deploy by the version buster and expires via maxAge). ProtectedRoute
// reads it to keep an offline user signed in when the auth/me check can't reach
// the server. Set on a successful auth/me or login, cleared on a definitive
// online sign-out or logout.
export const AUTH_FLAG = "auth_ok";

export function rememberAuth(): void {
  try {
    localStorage.setItem(AUTH_FLAG, "1");
  } catch {
    /* private mode / storage disabled — fall back to cache-only behaviour */
  }
}

export function forgetAuth(): void {
  try {
    localStorage.removeItem(AUTH_FLAG);
  } catch {
    /* ignore */
  }
}

export function wasAuthenticated(): boolean {
  try {
    return localStorage.getItem(AUTH_FLAG) === "1";
  } catch {
    return false;
  }
}

export function useMe() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => auth.me(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      auth.login(username, password),
    onSuccess: () => {
      rememberAuth();
      qc.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => auth.logout(),
    onSuccess: () => {
      forgetAuth();
      qc.clear();
    },
  });
}
