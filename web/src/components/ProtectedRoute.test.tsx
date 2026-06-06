import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mutable state the mocks read, declared via vi.hoisted so it exists before
// the hoisted vi.mock factories run.
const state = vi.hoisted(() => ({
  restoring: false,
  me: { data: undefined as unknown, isLoading: false, isError: false },
}));

vi.mock("@tanstack/react-query", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useIsRestoring: () => state.restoring };
});

// Keep the real flag helpers (rememberAuth/forgetAuth/wasAuthenticated); only
// stub useMe so we drive the auth result.
vi.mock("@/hooks/useAuth", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useMe: () => state.me };
});

import { ProtectedRoute } from "./ProtectedRoute";
import { AUTH_FLAG } from "@/hooks/useAuth";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/secret"]}>
      <Routes>
        <Route
          path="/secret"
          element={
            <ProtectedRoute>
              <div>SECRET</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  setOnline(true);
  localStorage.clear();
  state.restoring = false;
  state.me = { data: undefined, isLoading: false, isError: false };
});

describe("ProtectedRoute", () => {
  it("shows a loader while the persisted cache is restoring", () => {
    state.restoring = true;
    const { container } = renderRoute();
    expect(container.textContent).toContain("Загрузка");
    expect(container.textContent).not.toContain("SECRET");
  });

  it("renders children and remembers the session when authenticated", () => {
    state.me = { data: { authenticated: true }, isLoading: false, isError: false };
    const { container } = renderRoute();
    expect(container.textContent).toContain("SECRET");
    expect(localStorage.getItem(AUTH_FLAG)).toBe("1");
  });

  it("redirects to /login and clears the flag on a confirmed online sign-out", () => {
    setOnline(true);
    localStorage.setItem(AUTH_FLAG, "1");
    state.me = { data: { authenticated: false }, isLoading: false, isError: false };
    const { container } = renderRoute();
    expect(container.textContent).toContain("LOGIN");
    expect(localStorage.getItem(AUTH_FLAG)).toBeNull();
  });

  it("stays in the app offline when a session is remembered", () => {
    setOnline(false);
    localStorage.setItem(AUTH_FLAG, "1");
    // Offline: auth/me can't resolve — still loading, no data.
    state.me = { data: undefined, isLoading: true, isError: false };
    const { container } = renderRoute();
    expect(container.textContent).toContain("SECRET");
  });

  it("stays in the app when the auth check errors but a session is remembered", () => {
    setOnline(true);
    localStorage.setItem(AUTH_FLAG, "1");
    state.me = { data: undefined, isLoading: false, isError: true };
    const { container } = renderRoute();
    expect(container.textContent).toContain("SECRET");
  });

  it("shows a loader on the first online check with no remembered session", () => {
    setOnline(true);
    state.me = { data: undefined, isLoading: true, isError: false };
    const { container } = renderRoute();
    expect(container.textContent).toContain("Загрузка");
  });
});
