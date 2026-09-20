import type { HistoryEntry } from "../lib/history";
import { strings } from "../ui/strings";

interface Props {
  entries: readonly HistoryEntry[];
  /** The user clicked an entry: search again with its two names. */
  onPick: (entry: HistoryEntry) => void;
}

/** The search history (SPEC ADR-006): one button per entry, newest first as the hook keeps them. Nothing when empty. */
export default function HistoryList({ entries, onPick }: Props) {
  if (entries.length === 0) return null;
  return (
    <section aria-label={strings.historyLabel}>
      <h2>{strings.historyLabel}</h2>
      <ul className="chip-list">
        {entries.map((entry, index) => (
          // The same pair can appear twice (SPEC N-4: repeats are not specified), so the index is part of the key.
          <li key={`${index}:${entry.from}→${entry.to}`}>
            <button type="button" onClick={() => onPick(entry)} className="chip">
              {strings.historyEntry(entry.from, entry.to)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
