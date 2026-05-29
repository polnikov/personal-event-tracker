import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, auth } from "./api";

interface FakeResponseOpts {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string | null;
  body?: unknown;
  jsonThrows?: boolean;
}

function fakeResponse(opts: FakeResponseOpts = {}) {
  const {
    ok = true,
    status = 200,
    statusText = "OK",
    contentType = "application/json",
    body = undefined,
    jsonThrows = false,
  } = opts;
  return {
    ok,
    status,
    statusText,
    headers: {
      get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null),
    },
    json: async () => {
      if (jsonThrows) throw new Error("no json");
      return body;
    },
  };
}

function stubFetch(opts: FakeResponseOpts) {
  const mock = vi.fn().mockResolvedValue(fakeResponse(opts));
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request — success", () => {
  it("returns parsed JSON and calls the prefixed URL with credentials", async () => {
    const mock = stubFetch({ body: { username: "admin", authenticated: true } });
    const me = await auth.me();
    expect(me).toEqual({ username: "admin", authenticated: true });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("/api/auth/me");
    expect(init.credentials).toBe("include");
  });

  it("returns undefined for 204 No Content", async () => {
    stubFetch({ status: 204 });
    await expect(auth.logout()).resolves.toBeUndefined();
  });

  it("returns undefined for non-JSON responses", async () => {
    stubFetch({ contentType: "text/html", body: "<html>" });
    await expect(auth.me()).resolves.toBeUndefined();
  });
});

describe("request — errors", () => {
  it("throws ApiError carrying the server detail and status", async () => {
    stubFetch({ ok: false, status: 401, body: { detail: "Неверные учётные данные" } });
    await expect(auth.login("admin", "x")).rejects.toBeInstanceOf(ApiError);
    try {
      await auth.login("admin", "x");
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(401);
      expect(err.message).toBe("Неверные учётные данные");
      expect(err.body).toEqual({ detail: "Неверные учётные данные" });
    }
  });

  it("falls back to an HTTP status message when the body has no JSON", async () => {
    stubFetch({ ok: false, status: 500, statusText: "Server Error", jsonThrows: true });
    try {
      await auth.me();
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toBe("HTTP 500 Server Error");
      expect(err.status).toBe(500);
    }
  });
});
