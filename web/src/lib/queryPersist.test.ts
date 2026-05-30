import { afterEach, describe, expect, it } from "vitest";

import { db } from "./db";
import { queryStorage } from "./queryPersist";

afterEach(async () => {
  await db.queryCache.clear();
});

describe("queryStorage", () => {
  it("returns null for unknown keys", async () => {
    expect(await queryStorage.getItem("missing")).toBeNull();
  });

  it("round-trips values through IndexedDB", async () => {
    await queryStorage.setItem("k", "v1");
    expect(await queryStorage.getItem("k")).toBe("v1");
    await queryStorage.setItem("k", "v2"); // overwrite
    expect(await queryStorage.getItem("k")).toBe("v2");
  });

  it("removes entries", async () => {
    await queryStorage.setItem("k", "v");
    await queryStorage.removeItem("k");
    expect(await queryStorage.getItem("k")).toBeNull();
  });

  it("keeps independent keys isolated", async () => {
    await queryStorage.setItem("a", "1");
    await queryStorage.setItem("b", "2");
    expect(await queryStorage.getItem("a")).toBe("1");
    expect(await queryStorage.getItem("b")).toBe("2");
  });
});
