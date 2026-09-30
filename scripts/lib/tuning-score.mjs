// Threshold-free scoring, shared by everything that compares question variants. Nothing here
// picks a cut (decision D2): variants are compared on ranking, never on a chosen operating point.

export const auc = (rs) => {
  const pos = rs.filter((r) => r.positive).map((r) => r.score);
  const neg = rs.filter((r) => !r.positive).map((r) => r.score);
  if (pos.length === 0 || neg.length === 0) return null;
  let s = 0;
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (pos.length * neg.length);
};

export const perStyle = (rs) => {
  const styles = [...new Set(rs.filter((r) => r.positive).map((r) => r.subtype))].sort();
  return Object.fromEntries(
    styles.map((s) => [s, auc(rs.filter((r) => !r.positive || r.subtype === s))]),
  );
};

/** AUC of every cheat against one kind of legitimate play: where the false positives would come from. */
export const perLegit = (rs) => {
  const kinds = [...new Set(rs.filter((r) => !r.positive).map((r) => r.subtype))].sort();
  return Object.fromEntries(
    kinds.map((k) => [k, auc(rs.filter((r) => r.positive || r.subtype === k))]),
  );
};

/** Cheats that outrank every legitimate session: separation at the top, with no cut chosen. */
export const aboveEveryLegit = (rs) => {
  const neg = rs.filter((r) => !r.positive).map((r) => r.score);
  const ceiling = Math.max(...neg);
  return rs.filter((r) => r.positive && r.score > ceiling).length;
};

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
