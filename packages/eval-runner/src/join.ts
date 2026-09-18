import type { DecisionRecord, SessionLabel } from "@jevcraft/schema";

export interface LabeledDecision {
  sessionId: string;
  decision: DecisionRecord;
  label: SessionLabel;
}

export interface JoinResult {
  /** Rows usable for precision/recall: labeled, not `unknown`, and successfully evaluated. */
  rows: LabeledDecision[];
  unknownCount: number;
  errorCount: number;
  unlabeledSessionIds: string[];
  duplicateLabelSessionIds: string[];
}

export function joinDecisionsWithLabels(
  decisions: DecisionRecord[],
  labels: SessionLabel[],
): JoinResult {
  const bySession = new Map<string, SessionLabel>();
  const duplicates = new Set<string>();
  for (const label of labels) {
    if (bySession.has(label.sessionId)) duplicates.add(label.sessionId);
    else bySession.set(label.sessionId, label);
  }

  const result: JoinResult = {
    rows: [],
    unknownCount: 0,
    errorCount: 0,
    unlabeledSessionIds: [],
    duplicateLabelSessionIds: [...duplicates].sort(),
  };

  for (const decision of decisions) {
    const label = bySession.get(decision.sessionId);
    if (label === undefined) {
      result.unlabeledSessionIds.push(decision.sessionId);
      continue;
    }
    if (duplicates.has(decision.sessionId)) continue;
    if (label.label === "unknown") {
      result.unknownCount++;
      continue;
    }
    if (decision.answers === null) {
      result.errorCount++;
      continue;
    }
    result.rows.push({ sessionId: decision.sessionId, decision, label });
  }
  return result;
}
