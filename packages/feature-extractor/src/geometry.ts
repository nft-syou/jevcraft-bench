export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const length = (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const DEG = Math.PI / 180;

/**
 * Unit vector the player is looking along, Minecraft convention:
 * yaw 0 = +z (south), yaw 90 = -x (west); pitch +90 = straight down.
 */
export function viewVector(yawDeg: number, pitchDeg: number): Vec3 {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  const cosPitch = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cosPitch, y: -Math.sin(pitch), z: Math.cos(yaw) * cosPitch };
}

/** Angle between two vectors in degrees (0..180); null if either is (near) zero length. */
export function angleBetweenDeg(a: Vec3, b: Vec3): number | null {
  const la = length(a);
  const lb = length(b);
  if (la < 1e-9 || lb < 1e-9) return null;
  const cos = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)));
  return Math.acos(cos) / DEG;
}

/** Horizontal heading of the move from -> to in degrees (0..360), or null if it barely moved horizontally. */
export function headingDeg(from: Vec3, to: Vec3, minDistance = 0.25): number | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.sqrt(dx * dx + dz * dz) < minDistance) return null;
  return (((Math.atan2(dx, dz) / DEG) % 360) + 360) % 360;
}

/** Smallest difference between two headings in degrees (0..180). */
export function headingDeltaDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Population standard deviation. */
export function stdDev(values: number[]): number | null {
  const m = mean(values);
  if (m === null) return null;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export const round3 = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 1000) / 1000;
