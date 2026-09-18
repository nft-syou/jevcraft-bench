import { SCHEMA_VERSION } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

describe("schema package", () => {
  it("exposes schema version 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
