import type { BreakpointStage, PauseFilter } from './session.ts';
import { wildcardToRegExp } from './wildcard.ts';

const ALL_STAGES: readonly BreakpointStage[] = ['request', 'response'];

/** Stop every request at both stops: what "pause" meant before filters existed. */
export const DEFAULT_PAUSE_FILTER: PauseFilter = { methods: [], paths: [], stages: [...ALL_STAGES] };

export type PauseFilterResult = { ok: true; filter: PauseFilter } | { ok: false; error: string };

const METHOD = /^[A-Z]+$/;

/** Validates and normalizes a filter: trimmed, upper-cased methods, de-duplicated, stages in order. */
export function parsePauseFilter(input: unknown): PauseFilterResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Send { methods, paths, stages }' };
  }
  const { methods = [], paths = [], stages = ALL_STAGES } = input as Record<string, unknown>;
  if (!isStringArray(methods)) return { ok: false, error: 'methods must be an array of strings' };
  if (!isStringArray(paths)) return { ok: false, error: 'paths must be an array of strings' };
  if (!isStringArray(stages)) return { ok: false, error: 'stages must be an array of strings' };

  const cleanMethods = unique(methods.map((method) => method.trim().toUpperCase()).filter(Boolean));
  const badMethod = cleanMethods.find((method) => !METHOD.test(method));
  if (badMethod) return { ok: false, error: `Not an HTTP method: ${badMethod}` };

  const cleanPaths = unique(paths.map((path) => path.trim()).filter(Boolean));
  const badPath = cleanPaths.find((path) => !path.startsWith('/') && !path.startsWith('*'));
  if (badPath) return { ok: false, error: `Path patterns start with / or *: ${badPath}` };

  const badStage = stages.find((stage) => !(ALL_STAGES as readonly string[]).includes(stage));
  if (badStage) return { ok: false, error: `Unknown stop: ${badStage}` };
  if (stages.length === 0) return { ok: false, error: 'Pick at least one stop: request or response' };

  return {
    ok: true,
    filter: { methods: cleanMethods, paths: cleanPaths, stages: ALL_STAGES.filter((stage) => stages.includes(stage)) },
  };
}

/** Whether a paused session stops this request at `stage`. `path` is the forwarded path, without the query. */
export function shouldPause(filter: PauseFilter, stage: BreakpointStage, method: string, path: string): boolean {
  if (!filter.stages.includes(stage)) return false;
  if (filter.methods.length > 0 && !filter.methods.includes(method.toUpperCase())) return false;
  return filter.paths.length === 0 || filter.paths.some((pattern) => wildcardToRegExp(pattern).test(path));
}

export function isDefaultPauseFilter(filter: PauseFilter): boolean {
  return filter.methods.length === 0 && filter.paths.length === 0 && filter.stages.length === ALL_STAGES.length;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
