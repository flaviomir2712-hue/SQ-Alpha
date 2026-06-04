import L from "leaflet";

// Fallback shown when neither the event nor its creator has a picture.
// Asset must live in /public/ so Vite serves it at the root URL.
export const FALLBACK_LOGO = "/sidequest-logo.png";

// Resolve the URL chain: event.image → event.creator_picture → SQ logo.
export const pickMarkerImage = (event) =>
  event?.image || event?.creator_picture || FALLBACK_LOGO;

// Lightweight escape so the text we inject into the divIcon HTML can never
// break out of attribute/tag boundaries. Avoids XSS if the title comes
// from user input.
const escapeHTML = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// First letter shown when the SQ logo image also fails to load — gives
// the marker a non-broken last-resort visual instead of an empty circle.
const initialLetter = (event) => {
  const candidate =
    event?.title?.trim() ||
    event?.creator_username?.trim() ||
    event?.creator_email?.trim() ||
    "?";
  return escapeHTML(candidate.charAt(0).toUpperCase());
};

/**
 * Build a Leaflet divIcon. Layout:
 *
 *   [tooltip ↑ — visible only on :hover, ergonomic, fades]
 *        ⭕ avatar (event/creator/logo)
 *        ━━━━━━━━━     ← no gap, the count pill is attached to the
 *        [ 3 voy ]         bottom edge of the avatar
 *
 * Inline-styled so it works even without mapview.css. The :hover rule
 * MUST come from a stylesheet (CSS files don't run inline) — it's
 * defined in Mapview.jsx via a <style> block.
 *
 * The icon anchor sits at the bottom-centre of the AVATAR (not of the
 * count pill) so the map coordinate stays attached to the head of the
 * pin, exactly like a classic Leaflet marker.
 */
export const createMarkerAvatar = (event, size = 56, goingCount = 0, tooltipText = "") => {
  const imageUrl = typeof event === "string" ? event : pickMarkerImage(event);
  const letter   = typeof event === "string" ? "?" : initialLetter(event);

  // === Styles ===
  const wrapStyle =
    `width:${size}px;height:${size}px;position:relative;` +
    `display:flex;align-items:flex-start;justify-content:center;`;

  const circleStyle =
    `width:${size}px;height:${size}px;border-radius:50%;` +
    `overflow:hidden;border:2px solid #fff;` +
    `box-shadow:0 2px 8px rgba(0,0,0,0.4);` +
    `background:linear-gradient(135deg,#6366f1,#ec4899);` +
    `display:flex;align-items:center;justify-content:center;` +
    `color:#fff;font-weight:700;font-size:1.1rem;` +
    `box-sizing:border-box;`;

  const imgStyle = (imageUrl === FALLBACK_LOGO)
  ? `width:65%;height:55%;object-fit:contain;display:block;`
  : `width:100%;height:100%;object-fit:cover;display:block;`;

  // Count pill: position:absolute top:100% so it sits right at the
  // bottom edge of the avatar with NO gap. translateY(-50%) tucks half
  // of it under the border, giving the "attached" look.
  const countStyle =
    `position:absolute;left:50%;top:100%;` +
    `transform:translate(-50%,-50%);` +
    `background:linear-gradient(135deg,#22d3ee,#4f46e5);` +
    `color:#fff;font-size:0.66rem;font-weight:700;` +
    `padding:2px 8px;border-radius:999px;` +
    `white-space:nowrap;border:2px solid #0b0d12;` +
    `box-shadow:0 1px 4px rgba(0,0,0,0.5);` +
    `pointer-events:none;line-height:1.15;z-index:5;`;

  // Tooltip: smaller font, subtle background, fades. The :hover rule
  // lives in Mapview.jsx <style> so we just set the opacity 0 here.
  const tipStyle =
    `position:absolute;bottom:calc(100% + 10px);left:50%;` +
    `transform:translateX(-50%);` +
    `background:rgba(22,25,34,0.96);color:#e9ecef;` +
    `border:1px solid #262a36;border-radius:10px;` +
    `padding:5px 10px;font-size:0.8rem;font-weight:500;` +
    `white-space:nowrap;` +
    `opacity:0;pointer-events:none;` +
    `transition:opacity 0.18s ease, transform 0.18s ease;` +
    `box-shadow:0 6px 18px rgba(0,0,0,0.45);` +
    `z-index:10;`;

  // === HTML ===
  const inner = imageUrl
    ? `<img src="${escapeHTML(imageUrl)}" alt="" loading="lazy" style="${imgStyle}" onerror="this.style.display='none';this.parentElement.innerHTML='${letter}';"/>`
    : `<span>${letter}</span>`;

  const html =
    `<div class="sq-marker-wrapper" style="${wrapStyle}">` +
      `<div style="${circleStyle}">${inner}</div>` +
      (goingCount > 0
        ? `<span style="${countStyle}">${goingCount > 99 ? "99+" : goingCount} voy</span>`
        : "") +
      (tooltipText
        ? `<span class="sq-marker-tip-floater" style="${tipStyle}">${escapeHTML(tooltipText)}</span>`
        : "") +
    `</div>`;

  return L.divIcon({
    html,
    className: "sq-marker-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],   // anchor at bottom of AVATAR
  });
};

/** Component variant used outside the map (lists, modal rows, etc.) */
export const MarkerAvatar = ({ src, alt = "avatar", size = 56 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      overflow: "hidden",
      border: "2px solid #fff",
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      background: "linear-gradient(135deg,#6366f1,#ec4899)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {src && (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    )}
  </div>
);

export default MarkerAvatar;