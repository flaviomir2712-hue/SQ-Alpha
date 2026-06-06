import L from "leaflet";

// The fallback image shown when the event has no picture and the creator
// has no profile photo.  Must live in /public/ so Vite serves it at "/".
export const FALLBACK_LOGO = "/logoSideQuest.png";

/**
 * Pick the best image for a map marker, in priority order:
 *   1. event.image        — cover photo uploaded for the event
 *   2. event.creator_picture — creator's profile picture (from serialize())
 *   3. FALLBACK_LOGO      — SideQuest logo on dark background
 */
export const pickMarkerImage = (event) =>
  event?.image || event?.creator_picture || FALLBACK_LOGO;

/**
 * First letter to show when an event has no image and no creator photo —
 * derived from the event title, then creator username/email. Used as a
 * friendlier fallback than the bare logo on the map.
 */
export const pickMarkerLetter = (event) => {
  const candidate =
    event?.title?.trim() ||
    event?.creator_username?.trim() ||
    event?.creator_email?.trim() ||
    "";
  return candidate ? candidate.charAt(0).toUpperCase() : "";
};

/** Returns true when the URL points to our own fallback logo. */
const isLogoFallback = (url) => url === FALLBACK_LOGO;

// Lightweight XSS escape — tooltip text comes from user-supplied event titles.
const escapeHTML = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");


export const createMarkerAvatar = (
  imageUrl,
  size = 56,
  goingCount = 0,
  tooltipText = "",
  initialLetter = ""
) => {
  const useLogo = isLogoFallback(imageUrl);
  // When we'd otherwise show the bare logo but we have a letter, show the
  // letter instead — friendlier and identifies the event at a glance.
  const useLetter = useLogo && !!initialLetter;
  const logoClass = useLogo && !useLetter ? " has-logo" : "";
  const letterClass = useLetter ? " has-letter" : "";

  const parts = [];
  parts.push(
    `<div class="avatar-marker${logoClass}${letterClass}" style="width:${'56px'}px;height:${'56px'}px;">`
  );

  // Tooltip (hover only — rendered first so z-index stacking is correct)
  if (tooltipText) {
    parts.push(
      `<span class="avatar-marker-tip">${escapeHTML(tooltipText)}</span>`
    );
  }

  // Avatar: letter fallback, else image
  if (useLetter) {
    parts.push(
      `<span class="avatar-marker-letter">${escapeHTML(initialLetter)}</span>`
    );
  } else if (imageUrl) {
    parts.push(
      `<img src="${escapeHTML(imageUrl)}" alt="avatar" loading="lazy"/>`
    );
  }

  // "N going" pill — below the circle
  if (goingCount && goingCount > 0) {
    parts.push(
      `<span class="avatar-marker-going">${
        goingCount > 99 ? "99+" : goingCount
      } going</span>`
    );
  }

  parts.push(`</div>`);

  // iconAnchor Y is pushed down by ~14px to account for the pill below
  // so Leaflet still pins the circle centre to the lat/lng, not the pill.
  const pillOffset = goingCount > 0 ? 14 : 0;

  return L.divIcon({
    html: parts.join(""),
    className: "marker-avatar-icon",
    iconSize:   [size, size + pillOffset],
    iconAnchor: [size / 2, size],      // pin the BOTTOM of the circle
  });
};

/** React component variant — used outside the map (lists, modal rows, etc.) */
export const MarkerAvatar = ({ src, alt = "avatar", size = 56 }) => {
  const useLogo = isLogoFallback(src || FALLBACK_LOGO);
  return (
    <div
      className={`avatar-marker${useLogo ? " has-logo" : ""}`}
      style={{ width: size, height: size }}
    >
      {src && <img src={src} alt={alt} loading="lazy" />}
    </div>
  );
};

export default MarkerAvatar;