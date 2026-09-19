import type { PersonMeta } from "../api/types";
import { strings } from "../ui/strings";
import PersonThumbnail from "./PersonThumbnail";

/** The people of a path, in order (SearchResponse.path / PathResponse.path). */
export default function PathList({ people }: { people: readonly PersonMeta[] }) {
  return (
    <ol aria-label={strings.pathLabel}>
      {people.map((person) => (
        <li key={person.name}>
          <PersonThumbnail thumbnail={person.thumbnail} />
          {person.name}
        </li>
      ))}
    </ol>
  );
}
