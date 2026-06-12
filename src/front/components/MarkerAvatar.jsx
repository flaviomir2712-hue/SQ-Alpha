// Tanda 7G2 — Migración a MapLibre: este módulo ya no depende de
// Leaflet. createMarkerAvatar (que devolvía un L.divIcon) se sustituye
// por createMarkerAvatarElement, que devuelve un ELEMENTO DOM real con
// exactamente el mismo HTML/estilos inline — maplibregl.Marker acepta
// un elemento custom directamente ({ element, anchor: "bottom" }).

// Fallback shown when neither the event nor its creator has a picture.
// Asset must live in /public/ so Vite serves it at the root URL.
export const FALLBACK_LOGO = "/sidequest-logo.png";

// Resolve the URL chain: event.image → event.creator_picture → SQ logo.
export const pickMarkerImage = (event) =>
  event?.image || event?.creator_picture || FALLBACK_LOGO;

// Lightweight escape so the text we inject into the marker HTML can never
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
    "?";
  return escapeHTML(candidate.charAt(0).toUpperCase());
};

/**
 * Build the marker DOM element. Layout (idéntico a la era Leaflet):
 *
 *   [tooltip ↑ — visible only on :hover, ergonomic, fades]
 *        ⭕ avatar (event/creator/logo)
 *        ━━━━━━━━━     ← no gap, the count pill is attached to the
 *        [ 3 going ]       bottom edge of the avatar
 *
 * Everything visual is inline-styled so it cannot be broken by external
 * CSS cascades — that is what makes wide / tall / weird-aspect images
 * stay perfectly circular at exactly `size × size`.
 *
 * Two layers on purpose:
 *   .sq-marker-wrapper   → overflow: visible — lets the pill + tooltip
 *                          escape the circle's bounds.
 *   inner circle <div>   → overflow: hidden + fixed width/height +
 *                          box-sizing: border-box — the IMAGE inside it
 *                          can NEVER push the marker wider.
 *
 * The :hover rule MUST come from a stylesheet (CSS files don't run
 * inline), so it lives in Mapview.jsx via a <style> block.
 *
 * El anclaje al fondo-centro del avatar lo da MapLibre con
 * { anchor: "bottom" } al crear el Marker (equivalente al iconAnchor
 * [size/2, size] de Leaflet).
 */
export const createMarkerAvatarElement = (event, size = 56, goingCount = 0, tooltipText = "") => {
  // Accept either an event object OR a plain URL string (back-compat with
  // call sites that resolve the image themselves).
  const imageUrl = typeof event === "string" ? event : pickMarkerImage(event);
  const letter   = typeof event === "string" ? "?" : initialLetter(event);

  // === Inline styles ===
  // OJO (anclaje exacto): el wrapper NO debe llevar `position` inline.
  // MapLibre convierte este elemento en el marcador y le aplica su
  // clase .maplibregl-marker { position: absolute } + un transform de
  // posicionamiento. Un `position: relative` inline PISA esa clase,
  // deja el marcador en flujo normal y el translate parte de una base
  // incorrecta → los avatares se desplazan de su lat/lng real (cada
  // vez más visible al alejar el zoom). Los hijos absolutos (pill,
  // tooltip) siguen anclando bien: position:absolute del marcador
  // también crea contexto de posicionamiento.
  const wrapStyle =
    `width:${size}px;height:${size}px;` +
    `display:flex;align-items:flex-start;justify-content:center;` +
    `cursor:pointer;`;

  const circleStyle =
    `width:${size}px;height:${size}px;border-radius:50%;` +
    `overflow:hidden;border:2px solid #fff;` +
    `box-shadow:0 2px 8px rgba(0,0,0,0.4);` +
    `background:linear-gradient(135deg,#6366f1,#ec4899);` +
    `display:flex;align-items:center;justify-content:center;` +
    `color:#fff;font-weight:700;font-size:1.1rem;` +
    `box-sizing:border-box;`;

  // The logo asset is much taller than wide — `contain` at 65/55%
  // keeps it readable and centred inside the circle's gradient.
  // Real photos use full cover so they fill the circle.
  const imgStyle = (imageUrl === FALLBACK_LOGO)
    ? `width:65%;height:55%;object-fit:contain;display:block;`
    : `width:100%;height:100%;object-fit:cover;display:block;`;

  const countStyle =
    `position:absolute;left:50%;top:100%;` +
    `transform:translate(-50%,-50%);` +
    `background:linear-gradient(135deg,#22d3ee,#4f46e5);` +
    `color:#fff;font-size:0.66rem;font-weight:700;` +
    `padding:2px 8px;border-radius:999px;` +
    `white-space:nowrap;border:2px solid #0b0d12;` +
    `box-shadow:0 1px 4px rgba(0,0,0,0.5);` +
    `pointer-events:none;line-height:1.15;z-index:5;`;

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
  // The <img> has an onerror handler that swaps the image for the
  // initial letter if the asset 404s or fails to decode.
  const inner = imageUrl
    ? `<img src="${escapeHTML(imageUrl)}" alt="" loading="lazy" style="${imgStyle}" onerror="this.style.display='none';this.parentElement.innerHTML='${letter}';"/>`
    : `<span>${letter}</span>`;

  // data-event-id permite a Mapview encontrar este marker por id desde
  // fuera (querySelector). Lo usa la lógica de "two-tap to open" en
  // móvil para añadir/quitar la clase `.peeked` del tooltip.
  const eventIdAttr = typeof event === "object" && event?.id != null
    ? ` data-event-id="${escapeHTML(String(event.id))}"`
    : "";

  const html =
    `<div class="sq-marker-wrapper" style="${wrapStyle}"${eventIdAttr}>` +
      `<div style="${circleStyle}">${inner}</div>` +
      (goingCount > 0
        ? `<span style="${countStyle}">${goingCount > 99 ? "99+" : goingCount} going</span>`
        : "") +
      (tooltipText
        ? `<span class="sq-marker-tip-floater" style="${tipStyle}">${escapeHTML(tooltipText)}</span>`
        : "") +
    `</div>`;

  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild;
};

/** Component variant used outside the map (lists, modal rows, etc.).
 *  Same inline-style philosophy — image is locked inside a fixed circle,
 *  so a wide picture is cropped, never stretched. */
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
      boxSizing: "border-box",
      flexShrink: 0,
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
