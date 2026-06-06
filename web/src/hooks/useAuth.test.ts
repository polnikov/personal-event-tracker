import { afterEach, describe, expect, it } from "vitest";
import { AUTH_FLAG, forgetAuth, rememberAuth, wasAuthenticated } from "./useAuth";

afterEach(() => localStorage.clear());

describe("auth persistence flag", () => {
  it("is false by default", () => {
    expect(wasAuthenticated()).toBe(false);
  });

  it("rememberAuth sets the flag", () => {
    rememberAuth();
    expect(localStorage.getItem(AUTH_FLAG)).toBe("1");
    expect(wasAuthenticated()).toBe(true);
  });

  it("forgetAuth clears the flag", () => {
    rememberAuth();
    forgetAuth();
    expect(localStorage.getItem(AUTH_FLAG)).toBeNull();
    expect(wasAuthenticated()).toBe(false);
  });
});
