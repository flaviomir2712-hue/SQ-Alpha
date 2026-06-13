import { useEffect, useRef, useState } from "react";
import { Button, Form, Spinner, Badge } from "react-bootstrap";
import {
  FiCompass, FiX, FiSearch, FiMapPin, FiCalendar,
  FiExternalLink, FiPlus, FiNavigation,
} from "react-icons/fi";

import { api } from "../services/api";

// ════════════════════════════════════════════════════════════════
// DiscoverPanel — Tanda 7X
// ════════════════════════════════════════════════════════════════
//
// Panel desplegable SOBRE el mapa (no es una página): muestra eventos
// del mundo real (Ticketmaster hoy; más proveedores mañana — el backend
// normaliza todo a un esquema común en /api/discover/events).
//
//   - Modo "Near me": usa el GPS del mapa (prop userCenter) + radio.
//   - Modo "City":    búsqueda por ciudad → planear viajes.
//   - Filtros: keyword, categoría, fechas, precio máx (client-side).
//   - Click en una card  → onPreview(ev)    → el mapa hace flyTo.
//   - Botón "+ SideQuest" → onCreateFrom(ev) → abre el EventModal de
//     siempre PRE-RELLENADO (título, resumen, fecha, hora, dirección,
//     coordenadas, imagen) — el usuario edita lo que quiera e invita
//     a sus friends. El evento externo se convierte en quest propio.
//
// Desktop: drawer lateral izquierdo. Móvil: full-screen bajo el navbar.
// Styles mirror EventModal (same dark-mode tokens: #161922 / #262a36 /
// #0f111a / #6366f1 / #adb5bd / #e9ecef).
// ════════════════════════════════════════════════════════════════

const PANEL_CSS = `
.sq-discover-panel {
  position: absolute;
  top: 12px; left: 12px; bottom: 12px;
  width: min(400px, calc(100vw - 24px));
  z-index: 1035;                      /* sobre el mapa, bajo modales (1050) */
  display: flex; flex-direction: column;
  background: rgba(22, 25, 34, 0.97); /* matches EventModal #161922, frosted over the map */
  border: 1px solid #262a36;
  border-radius: 14px;                /* matches EventModal border-radius */
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
          backdrop-filter: blur(18px) saturate(160%);
  color: #e9ecef;
  overflow: hidden;
}
/* ── Mobile — full-screen bottom-sheet anchored to the viewport ──
   position: fixed (not absolute) so the panel is always relative to
   the viewport, never to the map container. This prevents:
     • the double top-offset (map already starts below the navbar)
     • the bottom-clip caused by browser chrome / address bar shrinking
   top = navbar height. If your navbar is a different height, adjust
   the --sq-navbar-h custom property in your root CSS instead of here.
   padding-bottom = safe-area-inset-bottom covers the iPhone home bar.
   border-radius flat on the bottom → feels like a native bottom-sheet. */
@media (max-width: 575.98px) {
  .sq-discover-panel {
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: auto;
    border-radius: 16px 16px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
body.sq-discover-open .sq-bottom-nav { display: none; }

/* ── Header ── */
.sq-discover-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.8rem 1rem 0.6rem;
  border-bottom: 1px solid #262a36;
}
.sq-discover-title {
  font-weight: 700; color: #fff; font-size: 1rem;
  display: flex; align-items: center; gap: 0.45rem;
}
.sq-discover-close {
  background: transparent !important; border: none !important;
  color: #adb5bd !important; padding: 0.15rem 0.35rem !important;
}
.sq-discover-close:hover { color: #fff !important; }

/* ── Filters ── */
.sq-discover-filters { padding: 0.7rem 1rem 0.5rem; border-bottom: 1px solid #262a36; }

/* Form labels — matches EventModal .form-label */
.sq-discover-filters .form-label {
  color: #adb5bd;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Inputs / selects — matches EventModal */
.sq-discover-filters .form-control,
.sq-discover-filters .form-select {
  background-color: #0f111a !important;
  color: #e9ecef !important;
  border-color: #2a2f42 !important;
  font-size: 0.84rem;
  box-shadow: none;
}
.sq-discover-filters .form-control::placeholder { color: #6c757d; }

/* ── Mode toggle: Near me / City ── */
.sq-discover-mode {
  display: flex; gap: 0.35rem; margin-bottom: 0.55rem;
}
.sq-discover-mode button {
  flex: 1;
  background: #0f111a !important; color: #adb5bd !important;
  border: 1px solid #2a2f42 !important;
  font-size: 0.78rem !important; font-weight: 600;
  padding: 0.3rem 0.4rem !important;
  border-radius: 8px !important;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
  transition: all 0.12s ease;
}
.sq-discover-mode button.active {
  background: rgba(99, 102, 241, 0.18) !important;
  border-color: #6366f1 !important; color: #fff !important;
}

/* ── Search button — matches EventModal primary gradient ── */
.sq-discover-search-btn {
  background: linear-gradient(135deg, #6366f1, #4f46e5) !important;
  border: none !important; font-weight: 600;
  font-size: 0.84rem !important;
}

/* ── Results list ── */
.sq-discover-results { flex: 1; overflow-y: auto; padding: 0.6rem 0.8rem 0.8rem; }
.sq-discover-results::-webkit-scrollbar { width: 0; }
.sq-discover-results { scrollbar-width: none; }

/* ── Event card — matches EventModal panel/card surfaces ── */
.sq-discover-card {
  background: #161922; border: 1px solid #262a36; border-radius: 12px;
  margin-bottom: 0.6rem; overflow: hidden; cursor: pointer;
  transition: transform 0.14s ease, border-color 0.14s ease;
}
.sq-discover-card:hover { transform: translateY(-2px); border-color: #6366f1; }
.sq-discover-card img.cover { width: 100%; height: 110px; object-fit: cover; display: block; }
.sq-discover-card-body { padding: 0.6rem 0.7rem 0.7rem; }
.sq-discover-card-title {
  font-weight: 700; color: #fff; font-size: 0.9rem; line-height: 1.25;
  margin-bottom: 0.25rem;
}
.sq-discover-meta {
  color: #adb5bd; font-size: 0.75rem; display: flex; align-items: center;
  gap: 0.3rem; margin-bottom: 0.15rem;
}
.sq-discover-badges { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.4rem 0 0.55rem; }
.sq-discover-actions { display: flex; gap: 0.4rem; }
.sq-discover-actions .btn {
  flex: 1; font-size: 0.74rem !important; font-weight: 600;
  padding: 0.28rem 0.4rem !important;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
}

/* ── Empty / error state ── */
.sq-discover-empty {
  color: #6c757d; font-style: italic; font-size: 0.85rem;
  text-align: center; padding: 1.8rem 1rem;
}

/* ── Load-more pill ── */
.sq-discover-load-more {
  width: 100%;
  background: transparent !important; color: #adb5bd !important;
  border: 1px solid #262a36 !important; font-size: 0.78rem !important;
  border-radius: 999px !important;
}
.sq-discover-load-more:hover { color: #fff !important; border-color: #6366f1 !important; }
`;

const CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "music", label: "Music" },
  { value: "sports", label: "Sports" },
  { value: "arts", label: "Arts & Theatre" },
  { value: "film", label: "Film" },
  { value: "misc", label: "Other" },
];

const fmtPrice = (ev) => {
  if (ev.price_min == null) return null;
  const cur = ev.currency || "";
  if (ev.price_max && ev.price_max !== ev.price_min) {
    return `${ev.price_min}–${ev.price_max} ${cur}`;
  }
  return `${ev.price_min} ${cur}`;
};

const fmtWhen = (ev) =>
  [ev.date, ev.time].filter(Boolean).join(" · ") || "Date TBA";

// ── Tanda 7X2 — Geocodificación ligera vía Nominatim (mismo proveedor
// que ya usa EventModal). Resuelve:
//   - ciudad → coordenadas + país  (modo viaje: habilita PredictHQ y
//     los festivos del país de destino)
//   - coords → país               (modo near me: festivos locales)
const geocodeCity = async (name) => {
  try {
    const res = await fetch(
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=" +
      encodeURIComponent(name)
    );
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      country: (hit.address?.country_code || "").toUpperCase() || null,
    };
  } catch {
    return null;
  }
};

// Tanda 7X3 — además del país, el NOMBRE de la ciudad: lo necesita
// HasData/Google Events (búsqueda textual "events in <place>") en modo
// near-me, donde no hay ciudad tecleada. zoom=10 para acertar la ciudad.
const reverseGeo = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lng}`
    );
    const data = await res.json();
    const a = data?.address || {};
    return {
      country: (a.country_code || "").toUpperCase() || null,
      place: a.city || a.town || a.village || a.municipality || a.state || null,
    };
  } catch {
    return { country: null, place: null };
  }
};

export const DiscoverPanel = ({
  show,
  onClose,
  userCenter,          // [lat, lng] | null — GPS que ya gestiona Mapview
  onPreview,           // (ev) => void — el mapa hace flyTo + marcador
  onCreateFrom,        // (ev) => void — abre EventModal pre-rellenado
}) => {
  const [mode, setMode] = useState(userCenter ? "near" : "city");
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [radius, setRadius] = useState(40);
  const [maxPrice, setMaxPrice] = useState("");
  // Tanda 7X5 — los eventos sin fecha (sobre todo de Google) llegan
  // marcados `incomplete` por el backend; ocultos por defecto, visibles
  // con este toggle ("missed details").
  const [showIncomplete, setShowIncomplete] = useState(false);

  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const didAutoSearchRef = useRef(false);

  // Tanda 7X2 — cachés de geocodificación (una llamada a Nominatim por
  // ciudad/posición, no una por búsqueda).
  const cityGeoCacheRef = useRef({});
  const nearGeoRef = useRef(null);

  // Tanda 7X2 — mientras el panel está abierto, ocultamos la pill nav
  // (mismo patrón que body.modal-open de los modales Bootstrap).
  useEffect(() => {
    if (!show) return;
    document.body.classList.add("sq-discover-open");
    return () => document.body.classList.remove("sq-discover-open");
  }, [show]);

  const resolveGeo = async () => {
    if (mode === "city") {
      const key = city.trim().toLowerCase();
      if (!cityGeoCacheRef.current[key]) {
        cityGeoCacheRef.current[key] = await geocodeCity(city.trim());
      }
      const g = cityGeoCacheRef.current[key];
      // place = lo tecleado (HasData busca "events in <ciudad>").
      return g ? { ...g, place: city.trim() } : { place: city.trim() };
    }
    if (userCenter) {
      if (!nearGeoRef.current) {
        nearGeoRef.current = await reverseGeo(userCenter[0], userCenter[1]);
      }
      return {
        lat: userCenter[0],
        lng: userCenter[1],
        country: nearGeoRef.current?.country || null,
        place: nearGeoRef.current?.place || null,
      };
    }
    return null;
  };

  const buildQuery = (pageN, geo) => {
    const p = new URLSearchParams();
    if (mode === "city" && city.trim()) {
      p.set("city", city.trim());
      // Coordenadas geocodificadas: habilitan PredictHQ en modo viaje
      // (Ticketmaster sigue usando `city`, que le funciona mejor).
      if (geo?.lat != null) {
        p.set("lat", geo.lat);
        p.set("lng", geo.lng);
        p.set("radius", radius || 40);
      }
    } else if (userCenter) {
      p.set("lat", userCenter[0]);
      p.set("lng", userCenter[1]);
      p.set("radius", radius || 40);
    }
    if (geo?.country) p.set("country", geo.country);
    if (geo?.place) p.set("place", geo.place);   // HasData/Google Events
    if (q.trim()) p.set("q", q.trim());
    if (category) p.set("category", category);
    if (dateFrom) p.set("start", dateFrom);
    if (dateTo) p.set("end", dateTo);
    p.set("page", pageN);
    return p.toString();
  };

  const search = async (pageN = 0) => {
    if (mode === "city" && !city.trim()) {
      setError("Type a city to search.");
      return;
    }
    if (mode === "near" && !userCenter) {
      setError("Location not available yet — try City mode.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const geo = await resolveGeo(); // best-effort: null no bloquea
      const data = await api.get(`/discover/events?${buildQuery(pageN, geo)}`);
      const list = data.events || [];
      setResults((prev) => (pageN === 0 ? list : [...prev, ...list]));
      setTotal(data.total || list.length);
      setPage(pageN);
    } catch (e) {
      setError(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  // Al abrir el panel con GPS disponible: sugerencias locales automáticas
  // (próximos eventos cerca de ti), una sola vez por sesión de panel.
  useEffect(() => {
    if (!show) {
      didAutoSearchRef.current = false;
      return;
    }
    if (didAutoSearchRef.current) return;
    if (userCenter) {
      didAutoSearchRef.current = true;
      setMode("near");
      search(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, userCenter]);

  if (!show) return null;

  // Filtros client-side (los proveedores no filtran por precio ni por
  // completitud en servidor):
  //   - precio: oculta lo que SUPERA el máximo; lo sin precio se queda.
  //   - incompletos (sin fecha): ocultos salvo que el toggle esté ON.
  const incompleteCount = results.filter((ev) => ev.incomplete).length;
  const visible = results.filter((ev) => {
    if (!showIncomplete && ev.incomplete) return false;
    if (maxPrice && !(ev.price_min == null || ev.price_min <= Number(maxPrice))) return false;
    return true;
  });

  return (
    <div className="sq-discover-panel" role="dialog" aria-label="Discover events">
      <style>{PANEL_CSS}</style>

      <div className="sq-discover-header">
        <div className="sq-discover-title">
          <FiCompass /> Discover events
        </div>
        <Button className="sq-discover-close" onClick={onClose} aria-label="Close">
          <FiX size={20} />
        </Button>
      </div>

      <div className="sq-discover-filters">
        <div className="sq-discover-mode">
          <button
            type="button"
            className={mode === "near" ? "active" : ""}
            onClick={() => setMode("near")}
            disabled={!userCenter}
            title={userCenter ? "Events around you" : "Waiting for GPS…"}
          >
            <FiNavigation size={13} /> Near me
          </button>
          <button
            type="button"
            className={mode === "city" ? "active" : ""}
            onClick={() => setMode("city")}
          >
            <FiMapPin size={13} /> City / trip
          </button>
        </div>

        {mode === "city" && (
          <Form.Control
            className="mb-2"
            placeholder="City — Madrid, Paris, Tokyo…"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(0); }}
          />
        )}

        <Form.Control
          className="mb-2"
          placeholder="Keyword (artist, team, festival…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(0); }}
        />

        <div className="d-flex gap-2 mb-2">
          <Form.Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Form.Select>
          {mode === "near" && (
            <Form.Select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              style={{ maxWidth: 110 }}
              title="Radius"
            >
              <option value={10}>10 km</option>
              <option value={40}>40 km</option>
              <option value={100}>100 km</option>
              <option value={300}>300 km</option>
            </Form.Select>
          )}
        </div>

        <div className="d-flex gap-2 mb-2">
          <Form.Control
            type="date" value={dateFrom} title="From"
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Form.Control
            type="date" value={dateTo} title="To"
            onChange={(e) => setDateTo(e.target.value)}
          />
          <Form.Control
            type="number" min="0" placeholder="Max €"
            value={maxPrice} title="Max price"
            onChange={(e) => setMaxPrice(e.target.value)}
            style={{ maxWidth: 90 }}
          />
        </div>

        <Button className="sq-discover-search-btn w-100" onClick={() => search(0)} disabled={loading}>
          {loading && page === 0
            ? <Spinner size="sm" animation="border" />
            : <><FiSearch className="me-1" /> Search</>}
        </Button>

        {/* Tanda 7X5 — "missed details": mostrar eventos sin fecha
            (sobre todo de Google). Solo aparece si los hay. */}
        {incompleteCount > 0 && (
          <Form.Check
            type="switch"
            id="sq-discover-incomplete"
            className="mt-2 small text-secondary"
            label={`Show ${incompleteCount} event${incompleteCount > 1 ? "s" : ""} missing a date`}
            checked={showIncomplete}
            onChange={(e) => setShowIncomplete(e.target.checked)}
          />
        )}
      </div>

      <div className="sq-discover-results">
        {error && <div className="sq-discover-empty">{error}</div>}

        {!error && !loading && visible.length === 0 && (
          <div className="sq-discover-empty">
            No events found — try a wider radius, other dates or another city.
          </div>
        )}

        {visible.map((ev) => (
          <div
            key={ev.id}
            className="sq-discover-card"
            onClick={() => onPreview && onPreview(ev)}
            title={ev.latitude != null ? "Show on map" : undefined}
          >
            {ev.image && (
              <img className="cover" src={ev.image} alt="" loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <div className="sq-discover-card-body">
              <div className="sq-discover-card-title">{ev.title}</div>
              <div className="sq-discover-meta">
                <FiCalendar size={12} /> {fmtWhen(ev)}
              </div>
              {(ev.venue_name || ev.location) && (
                <div className="sq-discover-meta">
                  <FiMapPin size={12} />
                  <span className="text-truncate">
                    {[ev.venue_name, ev.location].filter(Boolean).join(" — ")}
                  </span>
                </div>
              )}

              <div className="sq-discover-badges">
                {ev.category && <Badge bg="secondary">{ev.category}</Badge>}
                {fmtPrice(ev) && <Badge bg="info" text="dark">{fmtPrice(ev)}</Badge>}
                <Badge bg="dark" style={{ border: "1px solid #2a2f42" }}>
                  {ev.source}
                </Badge>
              </div>

              <div className="sq-discover-actions">
                {ev.url && (
                  <Button
                    variant="outline-light" size="sm" as="a"
                    href={ev.url} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <FiExternalLink /> Tickets
                  </Button>
                )}
                <Button
                  variant="primary" size="sm"
                  onClick={(e) => { e.stopPropagation(); onCreateFrom && onCreateFrom(ev); }}
                  title="See full details and create a SideQuest event here to invite your friends"
                >
                  {/* "(infos)" avisa de que al abrir se ven más detalles
                      (la descripción completa, no cabe en la card). */}
                  <FiPlus /> SideQuest <span className="opacity-75">(infos)</span>
                </Button>
              </div>
            </div>
          </div>
        ))}

        {!loading && visible.length > 0 && results.length < total && (
          <Button className="sq-discover-load-more" onClick={() => search(page + 1)}>
            Load more ({results.length}/{total})
          </Button>
        )}
        {loading && page > 0 && (
          <div className="text-center py-2"><Spinner size="sm" animation="border" /></div>
        )}
      </div>
    </div>
  );
};

export default DiscoverPanel;