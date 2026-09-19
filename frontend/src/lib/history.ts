// Search history in localStorage (SPEC ADR-006, Q-15, FE-02). Nothing goes to the backend.
import { useCallback, useRef, useState } from "react";

/** SPEC Q-15: at most 20 entries; adding one more drops the oldest. */
export const HISTORY_LIMIT = 20;

export const HISTORY_STORAGE_KEY = "sixth-degree.history";

/**
 * What an entry holds is the implementation's choice (SPEC N-4): the two canonical names searched.
 * How a repeated entry is treated is not specified either, and is not locked by any test: here a
 * repeat is simply added again.
 */
export interface HistoryEntry {
  from: string;
  to: string;
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const { from, to } = value as Record<string, unknown>;
  return typeof from === "string" && typeof to === "string";
}

/**
 * The stored entries (newest first). An empty key, corrupt JSON, JSON that is not a list, or items
 * that are not entries all read as "no history" (`[]`), never as an error. `null` means the storage
 * itself is unusable (blocked, private mode): the caller keeps its in-memory copy.
 */
function readStorage(): HistoryEntry[] | null {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, HISTORY_LIMIT);
  } catch (error) {
    // JSON.parse failed -> corrupt (empty); anything else (getItem threw) -> storage unusable.
    return error instanceof SyntaxError ? [] : null;
  }
}

function writeStorage(entries: readonly HistoryEntry[]): void {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Blocked or full: the history simply stays in memory for this page.
  }
}

/** Newest first. `add` keeps at most `HISTORY_LIMIT` entries and persists them. */
export function useHistory(): { entries: HistoryEntry[]; add: (entry: HistoryEntry) => void } {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => readStorage() ?? []);
  const latest = useRef(entries);

  const add = useCallback((entry: HistoryEntry) => {
    // Done here and not inside a setState updater: React StrictMode runs updaters twice, and a
    // side effect (the storage write) there would add the entry twice. The stored copy is the base,
    // so several hooks (or tabs) never overwrite each other with a stale list; when the storage is
    // unusable the in-memory list is the base.
    const next = [entry, ...(readStorage() ?? latest.current)].slice(0, HISTORY_LIMIT);
    latest.current = next;
    writeStorage(next);
    setEntries(next);
  }, []);

  return { entries, add };
}
