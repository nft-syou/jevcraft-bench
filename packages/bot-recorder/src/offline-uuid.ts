import { createHash, createHmac } from "node:crypto";

/** UUID an offline-mode server assigns to a player name (UUID v3 of "OfflinePlayer:<name>"). */
export function offlineUuid(name: string): string {
  const h = createHash("md5").update(`OfflinePlayer:${name}`, "utf8").digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x30;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const x = h.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/**
 * Same mapping as the plugin's PlayerPseudonymizer, so a recorder that knows the local
 * HMAC secret can label the sessions its bots produced without the plugin ever writing names.
 */
export function pseudonymize(secret: string, uuid: string): string {
  return `hmac-sha256:${createHmac("sha256", secret).update(uuid, "utf8").digest("hex")}`;
}
