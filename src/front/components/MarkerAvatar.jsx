import L from "leaflet";

/**
 * Crea un L.divIcon con un avatar circular para usar en <Marker icon={...} />.
 *
 * Se construye con DOM API (createElement + setAttribute) en vez de
 * concatenar strings en un template literal: asi el navegador escapa
 * automaticamente la URL y evitamos XSS si imageUrl viene del backend.
 */
export const createMarkerAvatar = (imageUrl, size = 56) => {
  const wrapper = document.createElement("div");
  wrapper.className = "avatar-marker";
  wrapper.style.width = `${size}px`;
  wrapper.style.height = `${size}px`;

  if (imageUrl) {
    const img = document.createElement("img");
    img.setAttribute("src", imageUrl);
    img.setAttribute("alt", "avatar");
    img.setAttribute("loading", "lazy");
    wrapper.appendChild(img);
  }

  return L.divIcon({
    html: wrapper.outerHTML,
    className: "marker-avatar-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
};

/**
 * Variante componente: para renderizar un avatar fuera del mapa
 * (por ejemplo en listas de asistentes a un evento).
 */
export const MarkerAvatar = ({ src, alt = "avatar", size = 56 }) => (
  <div
    className="avatar-marker"
    style={{ width: size, height: size }}
  >
    {src && <img src={src} alt={alt} loading="lazy" />}
  </div>
);

export default MarkerAvatar;
