import { z } from "zod";

/**
 * Reference distribution of a legit population's efficiency, used to fill
 * `efficiency.baselinePercentile` (spec §9). Built from labelled legit sessions with
 * `enoughEvidence`; the population definition (world, height band, method) is recorded in
 * `source` so datasets from different servers are never mixed silently.
 */
export const BaselineSchema = z.strictObject({
  schemaVersion: z.literal(1),
  metric: z.literal("valuableOrePer100Blocks"),
  source: z.string().min(1),
  sessionCount: z.number().int().min(1),
  values: z.array(z.number().min(0)).min(1),
});
export type Baseline = z.infer<typeof BaselineSchema>;

/** Share of reference values at or below `x`, as 0..100. */
export function percentileOf(values: number[], x: number): number {
  if (values.length === 0) return Number.NaN;
  const atOrBelow = values.filter((v) => v <= x).length;
  return Math.round((atOrBelow / values.length) * 1000) / 10;
}

export function buildBaseline(efficiencies: number[], source: string): Baseline {
  return BaselineSchema.parse({
    schemaVersion: 1,
    metric: "valuableOrePer100Blocks",
    source,
    sessionCount: efficiencies.length,
    values: [...efficiencies].sort((a, b) => a - b),
  });
}
