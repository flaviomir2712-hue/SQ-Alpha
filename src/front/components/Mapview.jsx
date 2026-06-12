import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Container, Spinner, Alert } from "react-bootstrap";
// Tanda 7G2 — Migración Leaflet → MapLibre GL.
//
// ¿Por qué? Los tiles de OpenStreetMap que usaba Leaflet son IMÁGENES
// ya renderizadas: al rotar el mapa, los nombres de calles giraban con
// él como una foto. MapLibre usa tiles VECTORIALES: las etiquetas son
// texto que el renderizador mantiene siempre horizontal mientras giras
// o inclinas — la rotación "como Google Maps" de verdad:
//   - dos dedos en móvil/tablet → rota e inclina
//   - click derecho + arrastrar (o Ctrl + arrastrar) en desktop → rota
//   - brújula del control de navegación → click → norte arriba
//
// Tiles: OpenFreeMap (https://openfreemap.org) — gratuito, sin API key,
// estilo "liberty" (aspecto OSM clásico, coherente con el mapa anterior).
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import useGlobalReducer from "../hooks/useGlobalReducer";
import { createMarkerAvatarElement } from "./MarkerAvatar";
import { EventModal } from "./EventModal";
// Tanda 7F2 — el mapa se refresca en tiempo real: ping "event:changed"
// del socket (cambios de cualquier usuario afectado) + evento DOM local
// (cambios hechos en este navegador desde modales fuera del mapa).
import { getSocket, EVENTS_CHANGED_EVENT } from "../services/socket";
import "./mapview.css";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Hover rule for the marker tooltip — has to live in a stylesheet (CSS
// rules don't run inline), so we inject it once via a <style> tag at the
// top of the rendered tree. Everything else about the marker is inline
// inside createMarkerAvatarElement to avoid cascade fights.
//
// COMPORTAMIENTO POR DISPOSITIVO:
//   Desktop (hover disponible):
//     - hover sobre marker → tooltip visible
//     - click sobre marker → abre modal directo
//   Touch (móvil/tablet — sin hover):
//     - el :hover CSS no se aplica (lo silenciamos abajo)
//     - 1er tap sobre marker → JS añade .peeked al wrapper → tooltip
//       visible (mismo efecto que hover en desktop)
//     - 2º tap sobre el MISMO marker → abre modal de detalle
//     - tap en mapa → quita .peeked (reset peek)
//
// La clase `.peeked` la añade/quita Mapview vía useEffect cuando
// cambia el estado `peekedMarkerId`. Se busca el wrapper por
// data-event-id (inyectado por createMarkerAvatarElement).
const MARKER_HOVER_CSS = `
.sq-marker-wrapper:hover .sq-marker-tip-floater {
  opacity: 1 !important;
  transform: translateX(-50%) translateY(-2px) !important;
}
@media (hover: none) {
  /* En táctil silenciamos el :hover (Safari/iOS lo dispara
     fantasmagóricamente tras el tap) y dejamos que el JS gestione
     la visibilidad vía .peeked, que es estable y predecible. */
  .sq-marker-wrapper:hover .sq-marker-tip-floater { opacity: 0 !important; }
  .sq-marker-wrapper.peeked .sq-marker-tip-floater {
    opacity: 1 !important;
    transform: translateX(-50%) translateY(-2px) !important;
  }
}
`;

// Detecta si el dispositivo NO tiene capacidad de hover (móvil/tablet).
const isTouchDevice = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: none)").matches;

// Selectores que indican que hay un overlay de Bootstrap abierto.
// Usado para suprimir el map-click cuando el usuario hace clic en el
// mapa para cerrar uno de estos overlays.
const OVERLAY_OPEN_SELECTOR =
  ".modal.show, .dropdown-menu.show, .offcanvas.show";
const hasOpenOverlay = () =>
  typeof document !== "undefined" &&
  (document.body.classList.contains("modal-open") ||
    !!document.querySelector(OVERLAY_OPEN_SELECTOR));

// Estado interno en [lat, lng] (igual que la era Leaflet y que la API
// de geolocalización). MapLibre trabaja en [lng, lat] — se convierte
// SOLO en la frontera con maplibre via toLngLat.
const MADRID = [40.4168, -3.7038];
const computeCenter = (userCenter) => userCenter || MADRID;
const toLngLat = ([lat, lng]) => [lng, lat];

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const daysUntilEvent = (event) => {
  if (!event?.date) return null;
  const evDate = new Date(event.date);
  if (Number.isNaN(evDate.getTime())) return null;
  const today = startOfDay(new Date());
  const ev = startOfDay(evDate);
  return Math.round((ev.getTime() - today.getTime()) / 86400000);
};

const formatDaysUntil = (n) => {
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 0) return `${-n} day${n === -1 ? "" : "s"} ago`;
  return `in ${n} day${n === 1 ? "" : "s"}`;
};

const formatTooltip = (event) => {
  const title = event.title || "Event";
  const when = formatDaysUntil(daysUntilEvent(event));
  const time = event.time || "";
  return [title, when, time].filter(Boolean).join(" · ");
};

// Blue "you are here" dot with a soft pulsing ring — mismo HTML que la
// versión Leaflet, ahora como elemento DOM para maplibregl.Marker.
// OJO: sin `position` inline en el div exterior — MapLibre le aplica
// .maplibregl-marker { position: absolute } y un position inline lo
// pisaría, desanclando el dot de su lat/lng (ver MarkerAvatar.jsx).
const createUserDotElement = () => {
  const host = document.createElement("div");
  host.innerHTML =
    `<div style="width:22px;height:22px;">` +
    `<div style="position:absolute;inset:-12px;border-radius:50%;` +
    `background:rgba(66,133,244,0.18);` +
    `animation:sq-user-pulse 2s ease-out infinite;` +
    `pointer-events:none;"></div>` +
    `<div style="position:absolute;top:50%;left:50%;` +
    `transform:translate(-50%,-50%);` +
    `width:16px;height:16px;` +
    `background:#4285f4;` +
    `border:3px solid #fff;border-radius:50%;` +
    `box-shadow:0 2px 6px rgba(0,0,0,0.45);` +
    `"></div>` +
    `</div>`;
  return host.firstElementChild;
};

// Predicate: does this event pass the current status filter?
//
// "all"        → legacy behaviour: hide pending invitations.
// "pending"    → show ONLY pending invitations (inverts the legacy hide).
// "created"    → only events I created.
// "going" / "maybe" / "not_going" → match against my_rsvp.
const matchesStatusFilter = (event, statusFilter, myId) => {
  switch (statusFilter) {
    case "pending":
      return event.my_status === "pending";
    case "created":
      return myId != null && event.creator_id === myId;
    case "going":
    case "maybe":
    case "not_going":
      // Pending invitations don't have an rsvp yet — exclude them.
      if (event.my_status === "pending") return false;
      return event.my_rsvp === statusFilter;
    case "all":
    default:
      return event.my_status !== "pending";
  }
};

const matchesVisibilityFilter = (event, visibilityFilter) => {
  switch (visibilityFilter) {
    case "public": return !!event.is_public;
    case "private": return !event.is_public;
    case "all":
    default: return true;
  }
};

export const Mapview = ({ onMapClick, onMarkerClick, onSaved }) => {
  const { store } = useGlobalReducer();
  const mapFilterDays = store?.mapFilterDays ?? null;
  const mapFilterVisibility = store?.mapFilterVisibility ?? "all";
  const mapFilterStatus = store?.mapFilterStatus ?? "all";
  const recenterMapNonce = store?.recenterMapNonce ?? 0;

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userCenter, setUserCenter] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);
  const [prefillCoords, setPrefillCoords] = useState(null);

  // ── UX two-tap (touch devices) ─────────────────────────────
  const [peekedMarkerId, setPeekedMarkerId] = useState(null);

  // ── Suppress map-click cuando había overlay abierto ───────
  const overlayWasOpenRef = useRef(false);

  // MapLibre se gestiona imperativamente: el mapa, el dot del usuario
  // y los markers viven en refs; React solo decide QUÉ markers existen.
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);

  const [followUser, setFollowUserState] = useState(true);
  const followUserRef = useRef(true);
  const setFollowUser = (v) => {
    followUserRef.current = v;
    setFollowUserState(v);
  };

  const isProgrammaticMoveRef = useRef(false);
  const hasAutoCenteredRef = useRef(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const pendingFocusIdRef = useRef(null);
  const [forceShowEventId, setForceShowEventId] = useState(null);

  // Los handlers de click del mapa/markers se registran UNA vez sobre
  // el mapa imperativo, pero cierran sobre estado de React que cambia:
  // refs siempre actualizadas al último render (patrón estándar para
  // integrar librerías imperativas).
  const handleMapClickRef = useRef(() => {});
  const handleMarkerClickRef = useRef(() => {});
  const handleUserInteractRef = useRef(() => {});

  useEffect(() => {
    const raw = searchParams.get("event");
    if (!raw) return;
    const id = parseInt(raw, 10);
    if (!Number.isNaN(id)) pendingFocusIdRef.current = id;
  }, [searchParams]);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const myId = currentUser?.id ?? null;

  // Tanda 7H — flag de vida del componente para cancelar los reintentos
  // de fetchEvents al desmontar, + tope de reintentos.
  const MAX_FETCH_RETRIES = 4;
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const fetchEvents = async () => {
    const apiUrl = import.meta.env.VITE_BACKEND_URL;
    if (!apiUrl) {
      setError("VITE_BACKEND_URL is missing from the frontend .env");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Tanda 7H — retry con TOPE y cancelable (antes: for(;;) infinito
    // sin flag de desmontaje — con el backend caído seguía reintentando
    // y haciendo setState sobre un componente muerto para siempre).
    let delay = 400;
    for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
      if (!aliveRef.current) return; // desmontado → abandonar en silencio
      try {
        // Tanda 7D — la autenticación viaja en la cookie httpOnly que
        // añade el parche global de fetch (services/auth.js).
        const res = await fetch(`${apiUrl}/api/events`);
        if (!aliveRef.current) return;
        if (!res.ok) {
          setError(`Failed to fetch events (${res.status})`);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (!aliveRef.current) return;
        const normalized = data
          .filter((e) => e.latitude != null && e.longitude != null)
          .map((e) => ({ ...e, position: [e.latitude, e.longitude] }));
        setEvents(normalized);
        setLoading(false);
        return;
      } catch (_) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 4000);
      }
    }
    // Reintentos agotados: NO se vacía nada — los markers que ya estaban
    // siguen en pantalla; el socket o el próximo aviso reintentarán.
    if (aliveRef.current) {
      setLoading(false);
      setError("Could not reach the server — showing the last loaded events.");
    }
  };

  // ── EFFECT: crear el mapa UNA vez ──────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: toLngLat(computeCenter(null)), // Madrid hasta el primer fix GPS
      zoom: 13,
    });

    // Zoom +/- , brújula (click → norte arriba) y pitch. La brújula
    // también sirve de indicador de rotación, como en Google Maps.
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right"
    );

    // Click en el mapa (los clicks sobre markers NO llegan aquí: los
    // markers son elementos DOM superpuestos al canvas).
    map.on("click", (e) => {
      handleMapClickRef.current({
        latitude: e.lngLat.lat,
        longitude: e.lngLat.lng,
      });
    });

    // Interacción manual → desactiva el follow del GPS. Rotar/inclinar
    // NO desactiva el follow (no cambia el centro).
    map.on("dragstart", () => handleUserInteractRef.current());
    map.on("zoomstart", () => {
      if (!isProgrammaticMoveRef.current) handleUserInteractRef.current();
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
      userMarkerRef.current = null;
    };
  }, []);

  // geolocation: watchPosition + one-time auto-center on first fix
  useEffect(() => {
    fetchEvents();

    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = [pos.coords.latitude, pos.coords.longitude];
        setUserCenter(next);

        if (!hasAutoCenteredRef.current && mapRef.current) {
          isProgrammaticMoveRef.current = true;
          mapRef.current.flyTo({ center: toLngLat(next), zoom: 14, duration: 800 });
          hasAutoCenteredRef.current = true;
          setTimeout(() => { isProgrammaticMoveRef.current = false; }, 900);
        }
      },
      () => { /* permission denied / unavailable -> fallback Madrid */ },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // deep-link focus: when ?event=<id> is set, fly to that event
  useEffect(() => {
    const targetId = pendingFocusIdRef.current;
    if (!targetId || events.length === 0 || !mapRef.current) return;

    const target = events.find((e) => e.id === targetId);
    if (!target || target.latitude == null || target.longitude == null) {
      pendingFocusIdRef.current = null;
      if (searchParams.get("event")) {
        searchParams.delete("event");
        setSearchParams(searchParams, { replace: true });
      }
      return;
    }

    setFollowUser(false);
    isProgrammaticMoveRef.current = true;
    mapRef.current.flyTo({
      center: [target.longitude, target.latitude],
      zoom: 15,
      duration: 1000,
    });
    setTimeout(() => { isProgrammaticMoveRef.current = false; }, 1100);

    setForceShowEventId(targetId);

    pendingFocusIdRef.current = null;
    if (searchParams.get("event")) {
      searchParams.delete("event");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // follow effect: pan to the user on each GPS update (follow ON only).
  useEffect(() => {
    if (!followUser || !userCenter || !mapRef.current) return;
    if (!hasAutoCenteredRef.current) return;
    if (isProgrammaticMoveRef.current) return;
    mapRef.current.panTo(toLngLat(userCenter), { duration: 500 });
  }, [userCenter, followUser]);

  // ── EFFECT: dot azul "you are here" ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userCenter) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }
    if (!userMarkerRef.current) {
      userMarkerRef.current = new maplibregl.Marker({
        element: createUserDotElement(),
        anchor: "center",
      })
        .setLngLat(toLngLat(userCenter))
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat(toLngLat(userCenter));
    }
  }, [userCenter]);

  // Listen for "recenter" requests from the pill-nav Home button.
  useEffect(() => {
    if (!recenterMapNonce) return;
    recenterOnUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterMapNonce]);

  // ── EFFECT (Tanda 7F2): refresco en tiempo real de los eventos ──
  // 1. "event:changed" (socket): el backend lo emite a la audiencia del
  //    evento (creador, participantes, invitados, amigos si es público)
  //    al crear/editar/borrar/responder/confirmar → refetch inmediato.
  // 2. EVENTS_CHANGED_EVENT (window): disparado por modales locales que
  //    no viven en el mapa (el "+" del pill nav) → el evento recién
  //    creado aparece al instante aunque el socket esté caído.
  useEffect(() => {
    const refresh = () => fetchEvents();

    window.addEventListener(EVENTS_CHANGED_EVENT, refresh);
    const socket = getSocket();
    if (socket) socket.on("event:changed", refresh);

    return () => {
      window.removeEventListener(EVENTS_CHANGED_EVENT, refresh);
      if (socket) socket.off("event:changed", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Combined filter pipeline. `forceShowEventId` always wins so the deep-link
  // ?event=<id> can never be hidden by the navbar filters.
  const visibleEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.id === forceShowEventId) return true;

      // Time window — past is always hidden, future is capped by mapFilterDays.
      const days = daysUntilEvent(e);
      if (days !== null) {
        if (days < 0) return false;
        if (mapFilterDays !== null && days > mapFilterDays) return false;
      }

      if (!matchesVisibilityFilter(e, mapFilterVisibility)) return false;
      if (!matchesStatusFilter(e, mapFilterStatus, myId)) return false;

      return true;
    });
  }, [
    events,
    mapFilterDays,
    mapFilterVisibility,
    mapFilterStatus,
    myId,
    forceShowEventId,
  ]);

  // ── EFFECT: sincronizar markers de eventos ─────────────────
  // Reconstrucción completa en cada cambio de visibleEvents: son
  // elementos DOM baratos (decenas, no miles) y así el contenido
  // (going count, tooltip, foto) nunca queda desactualizado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    visibleEvents.forEach((event) => {
      const el = createMarkerAvatarElement(
        event,
        56,
        event.going_count || 0,
        formatTooltip(event)
      );
      // stopPropagation: que el tap en un marker jamás dispare también
      // el click del mapa (que abriría el modal de crear evento).
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        handleMarkerClickRef.current(event);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([event.longitude, event.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [visibleEvents]);

  const handleUserInteract = () => {
    if (followUserRef.current) setFollowUser(false);
  };
  handleUserInteractRef.current = handleUserInteract;

  // ── EFFECT: capturar si había overlay abierto al mousedown ──
  useEffect(() => {
    const capture = () => {
      overlayWasOpenRef.current = hasOpenOverlay();
    };
    document.addEventListener("mousedown", capture, true);   // capture phase
    document.addEventListener("touchstart", capture, true);
    return () => {
      document.removeEventListener("mousedown", capture, true);
      document.removeEventListener("touchstart", capture, true);
    };
  }, []);

  // ── EFFECT: aplicar/quitar la clase .peeked al marker DOM ──
  useEffect(() => {
    document.querySelectorAll(".sq-marker-wrapper.peeked")
      .forEach((el) => el.classList.remove("peeked"));
    if (peekedMarkerId != null) {
      const el = document.querySelector(
        `.sq-marker-wrapper[data-event-id="${peekedMarkerId}"]`
      );
      if (el) el.classList.add("peeked");
    }
  }, [peekedMarkerId, visibleEvents]); // visibleEvents → re-aplica si los markers se re-pintan

  const recenterOnUser = () => {
    if (!mapRef.current) return;

    isProgrammaticMoveRef.current = true;
    setFollowUser(true);

    // 1) Feedback inmediato con el fix cacheado (si lo hay). De paso
    //    devolvemos el norte arriba (bearing 0) — gesto Google Maps.
    if (userCenter) {
      mapRef.current.flyTo({
        center: toLngLat(userCenter),
        zoom: 15,
        bearing: 0,
        pitch: 0,
        duration: 800,
      });
    }

    // 2) Refresco en segundo plano con maximumAge:0 — watchPosition se
    //    puede quedar congelado en móvil (pantalla dormida, pestaña en
    //    background); un getCurrentPosition fuerza lectura fresca.
    if (!navigator.geolocation) {
      setTimeout(() => { isProgrammaticMoveRef.current = false; }, 900);
      return;
    }

    const hadCache = !!userCenter;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = [pos.coords.latitude, pos.coords.longitude];
        setUserCenter(next);
        if (mapRef.current) {
          if (hadCache) {
            mapRef.current.panTo(toLngLat(next), { duration: 400 });
          } else {
            mapRef.current.flyTo({
              center: toLngLat(next),
              zoom: 15,
              bearing: 0,
              pitch: 0,
              duration: 800,
            });
          }
        }
        setTimeout(() => { isProgrammaticMoveRef.current = false; }, 900);
      },
      (err) => {
        console.warn("[Mapview] recenter getCurrentPosition failed:", err?.message || err);
        setTimeout(() => { isProgrammaticMoveRef.current = false; }, 900);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );
  };

  const handleMapClick = (coords) => {
    // ── SUPPRESS: si había un overlay abierto al iniciar el tap,
    //   este click se usa SOLO para cerrarlo.
    if (overlayWasOpenRef.current) {
      overlayWasOpenRef.current = false;
      return;
    }
    // También limpiamos cualquier marker "peeked".
    if (peekedMarkerId != null) setPeekedMarkerId(null);

    setActiveEventId(null);
    setPrefillCoords(coords);
    setModalOpen(true);
    onMapClick && onMapClick(coords);
  };
  handleMapClickRef.current = handleMapClick;

  const handleMarkerClick = (event) => {
    // ── TWO-TAP en touch devices ──
    if (isTouchDevice()) {
      const alreadyPeeked = peekedMarkerId === event.id;
      if (!alreadyPeeked) {
        setPeekedMarkerId(event.id);
        onMarkerClick && onMarkerClick(event);
        return;  // ← no abrimos modal todavía
      }
      // 2º tap: limpiamos el peek y caemos al flujo normal.
      setPeekedMarkerId(null);
    }

    setActiveEventId(event.id);
    setPrefillCoords(null);
    setModalOpen(true);
    onMarkerClick && onMarkerClick(event);
  };
  handleMarkerClickRef.current = handleMarkerClick;

  const handleClose = () => {
    setModalOpen(false);
    setActiveEventId(null);
    setPrefillCoords(null);
  };

  const handleSaved = (eventOrNull) => {
    fetchEvents();
    onSaved && onSaved(eventOrNull);
  };

  return (
    <Container fluid className="map-page p-0">
      <style>{MARKER_HOVER_CSS}</style>
      {loading && (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" />
        </div>
      )}

      {error && (
        <Alert variant="danger" className="m-3">{error}</Alert>
      )}

      <div
        className="sq-map-wrapper"
        style={{
          height: "calc(100vh - 56px)",
          marginTop: "56px",
          width: "100%",
        }}
      >
        <div
          ref={containerRef}
          className="sq-maplibre-container"
          style={{ height: "100%", width: "100%" }}
        />
      </div>

      <EventModal
        show={modalOpen}
        onHide={handleClose}
        eventId={activeEventId}
        prefillCoords={prefillCoords}
        currentUser={currentUser}
        onSaved={handleSaved}
        onDeleted={() => fetchEvents()}
      />
    </Container>
  );
};

export default Mapview;
