import type { CSSProperties } from "react";

// FE-06 (SPEC Q-19): a PersonMeta without a picture (`thumbnail = null`) gets a placeholder and no <img>
// at all, so nothing is requested and nothing shows as a broken image. A string is used as it is (Q-11):
// the URL from the API is never trimmed, resized or re-encoded.
const SIZE = 40;

const box: CSSProperties = {
  display: "inline-block",
  width: SIZE,
  height: SIZE,
  marginRight: 8,
  borderRadius: 4,
  verticalAlign: "middle",
};

export default function PersonThumbnail({ thumbnail }: { thumbnail: string | null }) {
  // "" is treated like null: an <img> with an empty src would re-request the page itself.
  if (thumbnail === null || thumbnail === undefined || thumbnail === "") {
    return <span data-testid="thumb-placeholder" aria-hidden="true" style={{ ...box, background: "#29292a" }} />;
  }
  // alt is empty on purpose: the name is written right next to the picture.
  return <img src={thumbnail} alt="" width={SIZE} height={SIZE} loading="lazy" style={{ ...box, objectFit: "cover" }} />;
}
