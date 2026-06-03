import L from "leaflet";

// Fallback shown when neither the event nor its creator has a picture.
// Asset must live in /public/ so Vite serves it at the root URL.
export const FALLBACK_LOGO = "/sidequest-logo.png";

export const pickMarkerImage = (event) =>
  event?.image || event?.creator_picture || FALLBACK_LOGO;

// Lightweight escape so the tooltip text we inject into the divIcon HTML
// can never break out of attribute/tag boundaries. Avoids XSS if the
// title comes from user input.
const escapeHTML = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Build a Leaflet divIcon that contains:
 *   - the avatar image (event picture → creator picture → SQ logo)
 *   - a "going" pill ABOVE the avatar (always visible when going_count > 0)
 *   - a tooltip pill HIGHER still (visible only on :hover, CSS-driven)
 *
 * Why CSS-driven and not react-leaflet `<Tooltip>`:
 *   - On touch devices the React tooltip is triggered by tap and stays
 *     stuck until the next outside tap, which is the bug the user hit.
 *   - Plain CSS :hover never fires on touch — mobile users go straight
 *     to the modal on tap, which is exactly the desired UX.
 */
export const createMarkerAvatar = (imageUrl, size = 56, goingCount = 0, tooltipText = "") => {
  const parts = [];
  parts.push(`<div class="avatar-marker" style="width:${size}px;height:${size}px;">`);

  if (imageUrl) {
    parts.push(`<img src="${escapeHTML(imageUrl)}" alt="avatar" loading="lazy"/>`);
  }
  if (goingCount && goingCount > 0) {
    parts.push(
      `<span class="avatar-marker-going">${
        goingCount > 99 ? "99+" : goingCount
      } voy</span>`
    );
  }
  if (tooltipText) {
    parts.push(`<span class="avatar-marker-tip">${escapeHTML(tooltipText)}</span>`);
  }
  parts.push(`</div>`);

  return L.divIcon({
    html: parts.join(""),
    className: "marker-avatar-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
};

/** Component variant used outside the map (lists, modal rows, etc.) */
export const MarkerAvatar = ({ src, alt = "avatar", size = 56 }) => (
  <div className="avatar-marker" style={{ width: size, height: size }}>
    {src && <img src={src} alt={alt} loading="lazy" />}
  </div>
);

export default MarkerAvatar;