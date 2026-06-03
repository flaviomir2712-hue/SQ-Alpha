import L from "leaflet";

// The fallback image shown when the event has no picture and the creator
// has no profile photo.  Must live in /public/ so Vite serves it at "/".
export const FALLBACK_LOGO = "/sidequest-logo.png";

/**
 * Pick the best image for a map marker, in priority order:
 *   1. event.image        — cover photo uploaded for the event
 *   2. event.creator_picture — creator's profile picture (from serialize())
 *   3. FALLBACK_LOGO      — SideQuest logo on dark background
 */
export const pickMarkerImage = (event) =>
  event?.image || event?.creator_picture || FALLBACK_LOGO;

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

/**
 * Build a Leaflet divIcon that renders:
 *
 *   ┌──────────────────────────┐   ← .avatar-marker-tip (hover only)
 *   │  Evento · mañana · 4:50  │
 *   └────────────┬─────────────┘
 *                ↓
 *        ╭──────────╮            ← .avatar-marker  (circle, single white border)
 *        │  photo / │
 *        │   logo   │
 *        ╰──────────╯
 *           ╭──────╮             ← .avatar-marker-going  (gradient pill, below)
 *           │ 3 voy│
 *           ╰──────╯
 *
 * Design decisions:
 *  - Single 2px white border (matches "variante actual").
 *  - Going-pill sits BELOW the circle so it never overlaps the tooltip.
 *  - Tooltip is CSS :hover only — never fires on touch (avoids iOS sticky-hover bug).
 *  - Logo fallback gets `has-logo` class → object-fit:contain + dark bg padding.
 */
export const createMarkerAvatar = (
  imageUrl,
  size = 56,
  goingCount = 0,
  tooltipText = ""
) => {
  const useLogo = isLogoFallback(imageUrl);
  const logoClass = useLogo ? " has-logo" : "";

  const parts = [];
  parts.push(
    `<div class="avatar-marker${logoClass}" style="width:${size}px;height:${size}px;">`
  );

  // Tooltip (hover only — rendered first so z-index stacking is correct)
  if (tooltipText) {
    parts.push(
      `<span class="avatar-marker-tip">${escapeHTML(tooltipText)}</span>`
    );
  }

  // Avatar image
  if (imageUrl) {
    parts.push(
      `<img src="${escapeHTML(imageUrl)}" alt="avatar" loading="lazy"/>`
    );
  }

  // "N voy" pill — below the circle
  if (goingCount && goingCount > 0) {
    parts.push(
      `<span class="avatar-marker-going">${
        goingCount > 99 ? "99+" : goingCount
      } voy</span>`
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