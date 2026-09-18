import { offlineUuid, pseudonymize } from "@jevcraft/bot-recorder";
import { describe, expect, it } from "vitest";

describe("offlineUuid", () => {
  it("matches the UUID the offline-mode server assigned to jevbot01", () => {
    // Observed from a live join: login ok, uuid 835db5eb-a484-3662-873d-d6b7a6d85d54
    expect(offlineUuid("jevbot01")).toBe("835db5eb-a484-3662-873d-d6b7a6d85d54");
  });

  it("is a version-3 UUID", () => {
    expect(offlineUuid("anyone")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("pseudonymize", () => {
  it("produces the plugin's id format and is stable per secret", () => {
    const id = pseudonymize("change-me-local-only", offlineUuid("jevbot01"));
    expect(id).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    expect(pseudonymize("change-me-local-only", offlineUuid("jevbot01"))).toBe(id);
    expect(pseudonymize("other", offlineUuid("jevbot01"))).not.toBe(id);
  });
});
