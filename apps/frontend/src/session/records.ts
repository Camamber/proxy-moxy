import type { BreakpointStage, RequestRecord, RequestStage } from '@proxy-moxy/shared';

const STAGE_RANK: Record<RequestStage, number> = { request: 0, upstream: 1, response: 2, done: 3 };

export const isSettled = (record: RequestRecord): boolean => record.stage === 'done';

/** The breakpoint a record is parked at, or null when it is not parked. */
export function heldStage(record: RequestRecord): BreakpointStage | null {
  return record.held && (record.stage === 'request' || record.stage === 'response') ? record.stage : null;
}

/** Replaces the record with the same id, or appends. */
export function upsertRecord(list: RequestRecord[], record: RequestRecord): RequestRecord[] {
  const index = list.findIndex((existing) => existing.id === record.id);
  if (index === -1) return [...list, record];
  const next = list.slice();
  next[index] = record;
  return next;
}

/**
 * Reconciles a server snapshot with what arrived over events meanwhile: for a known id the
 * copy that got further wins (ties go to the snapshot), and records the snapshot does not
 * know about (newer than it) are kept.
 */
export function mergeRecords(local: RequestRecord[], snapshot: RequestRecord[]): RequestRecord[] {
  const byId = new Map(snapshot.map((record) => [record.id, record]));
  for (const record of local) {
    const known = byId.get(record.id);
    if (!known || STAGE_RANK[record.stage] > STAGE_RANK[known.stage]) byId.set(record.id, record);
  }
  return [...byId.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
