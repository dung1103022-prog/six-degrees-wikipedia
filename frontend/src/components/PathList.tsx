import type { PersonMeta } from "../api/types";
import { strings } from "../ui/strings";
import PersonThumbnail from "./PersonThumbnail";

/** The people of a path, in order (SearchResponse.path / PathResponse.path). Each name links to its
 * `wiki_url` (already on PersonMeta, no API change) — design request, 2026-09-21. */
export default function PathList({ people }: { people: readonly PersonMeta[] }) {
  return (
    <ol aria-label={strings.pathLabel} className="path-list">
      {people.map((person) => (
        <li key={person.name} className="path-item">
          <PersonThumbnail thumbnail={person.thumbnail} />
          <a href={person.wiki_url} target="_blank" rel="noopener noreferrer">
            {person.name}
          </a>
        </li>
      ))}
    </ol>
  );
}
