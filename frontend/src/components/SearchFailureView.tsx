import type { SearchFailure } from "../api/search";
import type { ErrorDetail, PersonMeta } from "../api/types";
import { strings } from "../ui/strings";
import PersonThumbnail from "./PersonThumbnail";

interface Props {
  failure: SearchFailure;
  /** The user picked a candidate of AMBIGUOUS_NAME: search again with `candidate.name`, the canonical name. */
  onChoose: (param: ErrorDetail["param"], candidate: PersonMeta) => void;
}

/** A failed search, by `detail.code` (SPEC §3.2, FE-03): the message is in an alert, ambiguous names add the candidates. */
export default function SearchFailureView({ failure, onChoose }: Props) {
  if (failure.kind === "other") return <p role="alert">{strings.searchFailed(failure.reason)}</p>;

  const { detail } = failure;
  if (failure.kind === "unresolved") return <p role="alert">{strings.unresolved(detail.input, detail.param)}</p>;

  return (
    <>
      <p role="alert">{strings.ambiguous(detail.input, detail.param)}</p>
      <ul aria-label={strings.candidatesLabel}>
        {detail.candidates.map((candidate) => (
          <li key={candidate.name}>
            <button type="button" onClick={() => onChoose(detail.param, candidate)}>
              <PersonThumbnail thumbnail={candidate.thumbnail} />
              {candidate.name}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
