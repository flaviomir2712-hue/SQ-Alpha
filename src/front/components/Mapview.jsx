import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { Container, Spinner, Alert } from "react-bootstrap";
import { FiCrosshair } from "react-icons/fi";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import useGlobalReducer from "../hooks/useGlobalReducer";
import { createMarkerAvatar } from "./MarkerAvatar";
import MapClickHandler from "./MapClickHandler";
import { EventModal } from "./EventModal";
import "./mapview.css";

const MADRID = [40.4168, -3.7038];
const computeCenter = (userCenter) => userCenter || MADRID;

// ── Tooltip helpers ────────────────────────────────────────
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
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n < 0) return `hace ${-n} día${n === -1 ? "" : "s"}`;
  return `en ${n} día${n === 1 ? "" : "s"}`;
};

const formatTooltip = (event) => {
  const title = event.title || "Evento";
  const when  = formatDaysUntil(daysUntilEvent(event));
  const time  = event.time || "";
  return [title, when, time].filter(Boolean).join(" · ");
};

// ── User location dot (Google Maps style) ─────────────────
const createUserDotIcon = () =>
  L.divIcon({
    html:
      `<div style="position:relative;width:22px;height:22px;">` +
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
      `</div>`,
    className: "sq-user-dot-icon",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

// ── Detector de interacción manual ─────────────────────────
// Vit à l'intérieur du MapContainer (react-leaflet impose ça pour
// useMapEvents). Détecte les drags utilisateur ET les zooms manuels,
// en filtrant les mouvements programmatiques via le ref `isProgRef`.
const UserInteractionWatcher = ({ isProgRef, onUserInteract }) => {
  useMapEvents({
    dragstart: () => {
      // dragstart ne se déclenche QUE pour les drags utilisateur —
      // les flyTo / panTo programmatiques ne le firent pas.
      onUserInteract();
    },
    zoomstart: () => {
      // zoomstart fire aussi pour les flyTo programmatiques → filtre.
      if (!isProgRef.current) onUserInteract();
    },
  });
  return null;
};

/**
 * Mapview con modo "follow" estilo Google Maps:
 *   - Por defecto la carte suit l'utilisateur (panTo cada GPS update).
 *   - Si el user arrastra o zoomea manualmente → follow OFF.
 *   - Click en el botón 🎯 → follow ON otra vez + flyTo a la posición.
 *   - Botón visual: rellena d'azul cuando follow ON, blanco cuando OFF.
 */
export const Mapview = ({ onMapClick, onMarkerClick, onSaved }) => {
  const { store } = useGlobalReducer();
  const mapFilterDays = store?.mapFilterDays ?? null;

  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [userCenter, setUserCenter] = useState(null);

  const [modalOpen, setModalOpen]         = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);
  const [prefillCoords, setPrefillCoords] = useState(null);

  // Map instance + follow-mode state ──
  const mapRef = useRef(null);
  const [followUser, setFollowUserState] = useState(true);
  // Mirror le state dans un ref pour accéder à la dernière valeur
  // dans des handlers async sans souffrir des stale closures.
  const followUserRef = useRef(true);
  const setFollowUser = (v) => {
    followUserRef.current = v;
    setFollowUserState(v);
  };

  // Flag pour distinguer les mouvements programmatiques (notre flyTo)
  // des zooms utilisateur, afin de ne PAS désactiver le follow quand
  // c'est nous qui faisons bouger la carte.
  const isProgrammaticMoveRef = useRef(false);

  const hasAutoCenteredRef = useRef(false);

  // ── Focus on a specific event (deep-link from other pages) ──
  // When the URL has ?event=<id> we fly to that event's coords and
  // force-show its marker on the map even if the user has a pending
  // invitation (which normally hides it). The id is captured into a ref
  // because the URL param can disappear before the events arrive.
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingFocusIdRef = useRef(null);
  const [forceShowEventId, setForceShowEventId] = useState(null);

  useEffect(() => {
    const raw = searchParams.get("event");
    if (!raw) return;
    const id = parseInt(raw, 10);
    if (Number.isFinite(id)) pendingFocusIdRef.current = id;
  }, [searchParams]);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");

  // ── fetch events with retry ──────────────────────────
  const fetchEvents = async () => {
    const apiUrl = import.meta.env.VITE_BACKEND_URL;
    const token  = localStorage.getItem("token");
    if (!apiUrl) {
      setError("Falta VITE_BACKEND_URL en el .env del frontend");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    let delay = 400;
    for (;;) {
      try {
        const res = await fetch(`${apiUrl}/api/events`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          setError(`Failed to fetch events (${res.status})`);
          setLoading(false);
          return;
        }
        const data = await res.json();
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
  };

  // ── geolocation: watchPosition + auto-center first fix ──
  useEffect(() => {
    fetchEvents();

    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = [pos.coords.latitude, pos.coords.longitude];
        setUserCenter(next);

        // Premier fix → flyTo automatique une seule fois
        if (!hasAutoCenteredRef.current && mapRef.current) {
          isProgrammaticMoveRef.current = true;
          mapRef.current.flyTo(next, 14, { duration: 0.8 });
          hasAutoCenteredRef.current = true;
          setTimeout(() => { isProgrammaticMoveRef.current = false; }, 900);
        }
      },
      () => { /* permission denied / unavailable → fallback Madrid */ },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ── deep-link focus: when ?event=<id> is set, fly to that event ──
  // Runs whenever events arrive. If we have a pending focus id and the
  // map is mounted, we centre on that event, force-show its marker, and
  // clear the URL param so a reload doesn't refire the focus.
  useEffect(() => {
    const targetId = pendingFocusIdRef.current;
    if (!targetId || events.length === 0 || !mapRef.current) return;

    const target = events.find((e) => e.id === targetId);
    if (!target || target.latitude == null || target.longitude == null) {
      // Event not found or not geolocated → clear and bail.
      pendingFocusIdRef.current = null;
      if (searchParams.get("event")) {
        searchParams.delete("event");
        setSearchParams(searchParams, { replace: true });
      }
      return;
    }

    // Stop follow mode and fly to the event.
    setFollowUser(false);
    isProgrammaticMoveRef.current = true;
    mapRef.current.flyTo(
      [target.latitude, target.longitude],
      15,
      { duration: 1 }
    );
    setTimeout(() => { isProgrammaticMoveRef.current = false; }, 1100);

    // Force-show the marker even if the event is in pending state.
    setForceShowEventId(targetId);

    // Clear the param so future reloads centre on the user instead.
    pendingFocusIdRef.current = null;
    if (searchParams.get("event")) {
      searchParams.delete("event");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // ── follow effect: pan vers l'utilisateur à chaque update GPS ──
  // Uniquement si follow est ON. Utilise panTo (pas flyTo) parce qu'on
  // veut un déplacement fluide sans changement de zoom — et panTo ne
  // déclenche pas zoomstart, donc UserInteractionWatcher ne voit rien.
  useEffect(() => {
    if (!followUser || !userCenter || !mapRef.current) return;
    if (!hasAutoCenteredRef.current) return; // pas encore d'auto-center
    mapRef.current.panTo(userCenter, { animate: true, duration: 0.5 });
  }, [userCenter, followUser]);

  const mapCenter = useMemo(() => computeCenter(userCenter), [userCenter]);

  // ── filter events ────────────────────────────────────
  const visibleEvents = useMemo(() => {
    return events.filter((e) => {
      // Force-shown event always passes through (deep-link from a list).
      if (e.id === forceShowEventId) return true;
      if (e.my_status === "pending") return false;
      const days = daysUntilEvent(e);
      if (days === null) return true;
      if (days < 0) return false;
      if (mapFilterDays !== null && days > mapFilterDays) return false;
      return true;
    });
  }, [events, mapFilterDays, forceShowEventId]);

  // ── handlers ────────────────────────────────────────
  const handleMapClick = (coords) => {
    setActiveEventId(null);
    setPrefillCoords(coords);
    setModalOpen(true);
    onMapClick && onMapClick(coords);
  };

  const handleMarkerClick = (event) => {
    setActiveEventId(event.id);
    setPrefillCoords(null);
    setModalOpen(true);
    onMarkerClick && onMarkerClick(event);
  };

  const handleClose = () => {
    setModalOpen(false);
    setActiveEventId(null);
    setPrefillCoords(null);
  };

  const handleSaved = (eventOrNull) => {
    fetchEvents();
    onSaved && onSaved(eventOrNull);
  };

  // L'utilisateur a fait drag ou zoom manuel → on coupe le follow.
  const handleUserInteract = () => {
    if (followUserRef.current) setFollowUser(false);
  };

  // Click sur le bouton 🎯 → réactive le follow + flyTo immédiat.
  const recenterOnUser = () => {
    if (!mapRef.current || !userCenter) return;
    isProgrammaticMoveRef.current = true;
    setFollowUser(true);
    mapRef.current.flyTo(userCenter, 15, { duration: 0.8 });
    setTimeout(() => { isProgrammaticMoveRef.current = false; }, 900);
  };

  // ── render ──────────────────────────────────────────
  return (
    <Container fluid className="map-page p-0">
      <style>{`
        .sq-marker-icon { background: transparent !important; border: 0 !important; }
        .sq-marker-wrapper:hover .sq-marker-tip-floater {
          opacity: 1 !important;
          transform: translateX(-50%) translateY(-3px) !important;
        }
        @media (hover: none) {
          .sq-marker-wrapper:hover .sq-marker-tip-floater { opacity: 0 !important; }
        }
        .sq-user-dot-icon { background: transparent !important; border: 0 !important; }
        @keyframes sq-user-pulse {
          0%   { transform: scale(0.8); opacity: 0.8; }
          70%  { transform: scale(1.6); opacity: 0;   }
          100% { transform: scale(1.6); opacity: 0;   }
        }
        .sq-recenter-btn {
          position: absolute;
          bottom: 20px;
          right: 16px;
          z-index: 500;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 1px solid #d0d4dc;
          box-shadow: 0 2px 10px rgba(0,0,0,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease,
                      background 0.18s ease, color 0.18s ease,
                      border-color 0.18s ease;
        }
        /* Follow OFF → white background, blue icon (call to action) */
        .sq-recenter-btn.is-off {
          background: #fff;
          color: #4285f4;
        }
        /* Follow ON → solid blue, white icon (active state) */
        .sq-recenter-btn.is-on {
          background: #4285f4;
          color: #fff;
          border-color: #4285f4;
        }
        .sq-recenter-btn:hover {
          transform: scale(1.06);
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        }
        .sq-recenter-btn:active { transform: scale(0.95); }
        .sq-recenter-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }
      `}</style>

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
        style={{ height: "calc(100vh - 56px - 64px)", width: "100%", position: "relative" }}
      >
        <MapContainer
          center={mapCenter}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          <MapClickHandler onMapClick={handleMapClick} />

          {/* Détecteur d'interaction utilisateur — coupe le follow */}
          <UserInteractionWatcher
            isProgRef={isProgrammaticMoveRef}
            onUserInteract={handleUserInteract}
          />

          {/* User location dot */}
          {userCenter && (
            <Marker
              position={userCenter}
              icon={createUserDotIcon()}
              interactive={false}
              keyboard={false}
            />
          )}

          {/* Event markers */}
          {visibleEvents.map((event) => (
            <Marker
              key={event.id}
              position={event.position}
              icon={createMarkerAvatar(
                event,
                56,
                event.going_count || 0,
                formatTooltip(event),
              )}
              eventHandlers={{ click: () => handleMarkerClick(event) }}
            />
          ))}
        </MapContainer>

        {/* Bouton recentrer + indicateur visuel du mode follow */}
        <button
          type="button"
          className={`sq-recenter-btn ${followUser ? "is-on" : "is-off"}`}
          onClick={recenterOnUser}
          disabled={!userCenter}
          title={
            !userCenter
              ? "Esperando GPS..."
              : followUser
              ? "Siguiéndote · Click para recentrar"
              : "Volver a seguirme"
          }
        >
          <FiCrosshair size={20} />
        </button>
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