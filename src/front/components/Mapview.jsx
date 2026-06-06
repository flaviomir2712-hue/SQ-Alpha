import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { useSearchParams } from "react-router-dom";
import { Container, Spinner, Alert } from "react-bootstrap";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import useGlobalReducer from "../hooks/useGlobalReducer";
import { createMarkerAvatar } from "./MarkerAvatar";
import MapClickHandler from "./MapClickHandler";
import { EventModal } from "./EventModal";
import "./mapview.css";

// Hover rule for the marker tooltip — has to live in a stylesheet (CSS
// rules don't run inline), so we inject it once via a <style> tag at the
// top of the rendered tree. Everything else about the marker is inline
// inside createMarkerAvatar to avoid cascade fights.
const MARKER_HOVER_CSS = `
.sq-marker-icon { background: transparent !important; border: 0 !important; }
.sq-marker-wrapper:hover .sq-marker-tip-floater {
  opacity: 1 !important;
  transform: translateX(-50%) translateY(-2px) !important;
}
@media (hover: none) {
  .sq-marker-wrapper:hover .sq-marker-tip-floater { opacity: 0 !important; }
}
`;

const MADRID = [40.4168, -3.7038];
const computeCenter = (userCenter) => userCenter || MADRID;

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

// Blue "you are here" dot with a soft pulsing ring.
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

// Manual-interaction detector. Lives inside MapContainer (react-leaflet
// requires that for useMapEvents). Detects user drags and manual zooms,
// filtering out programmatic moves via the isProgRef flag.
const UserInteractionWatcher = ({ isProgRef, onUserInteract }) => {
  useMapEvents({
    dragstart: () => {
      onUserInteract();
    },
    zoomstart: () => {
      if (!isProgRef.current) onUserInteract();
    },
  });
  return null;
};

// Predicate: does this event pass the current status filter?
//
// "all"        → legacy behaviour: hide pending invitations.
// "pending"    → show ONLY pending invitations (inverts the legacy hide).
// "created"    → only events I created.
// "going" / "maybe" / "not_going" → match against my_rsvp.
//
// Implemented as a free function so the visibleEvents useMemo stays
// declarative and easy to read.
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

  const mapRef = useRef(null);

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

  useEffect(() => {
    const raw = searchParams.get("event");
    if (!raw) return;
    const id = parseInt(raw, 10);
    if (!Number.isNaN(id)) pendingFocusIdRef.current = id;
  }, [searchParams]);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const myId = currentUser?.id ?? null;

  const fetchEvents = async () => {
    const apiUrl = import.meta.env.VITE_BACKEND_URL;
    const token = localStorage.getItem("token");
    if (!apiUrl) {
      setError("VITE_BACKEND_URL is missing from the frontend .env");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    let delay = 400;
    for (; ;) {
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
          mapRef.current.flyTo(next, 14, { duration: 0.8 });
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
    mapRef.current.flyTo([target.latitude, target.longitude], 15, { duration: 1 });
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
  // Skip while a programmatic move (initial auto-center, FiHome recenter)
  // is in flight — otherwise a concurrent panTo would interrupt the
  // flyTo animation half-way and the recenter would visually stop short.
  useEffect(() => {
    if (!followUser || !userCenter || !mapRef.current) return;
    if (!hasAutoCenteredRef.current) return;
    if (isProgrammaticMoveRef.current) return;
    mapRef.current.panTo(userCenter, { animate: true, duration: 0.5 });
  }, [userCenter, followUser]);

  // ─────────────────────────────────────────────────────────────
  // Listen for "recenter" requests from the pill-nav Home button.
  // The store nonce is bumped each click; we re-run on every change
  // and skip the initial 0 (which would otherwise auto-fire on mount).
  // recenterOnUser is intentionally NOT in the deps — it's a stable
  // closure over mapRef / userCenter / followUser refs+state, and the
  // existing useEffects in this file follow the same convention.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!recenterMapNonce) return;
    recenterOnUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterMapNonce]);

  const mapCenter = useMemo(() => computeCenter(userCenter), [userCenter]);

  // Combined filter pipeline. `forceShowEventId` always wins so the deep-link
  // ?event=<id> can never be hidden by the navbar filters.
  // Otherwise the event must pass every dimension:
  //   1. not in the past (unless the time filter is "Today" / value === 0,
  //      in which case events with days === 0 are kept; older still hidden)
  //   2. within the look-ahead window if mapFilterDays !== null
  //   3. visibility (all / public / private)
  //   4. status   (all / going / maybe / not_going / pending / created)
  const visibleEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.id === forceShowEventId) return true;

      // Time window — past is always hidden, future is capped by mapFilterDays.
      const days = daysUntilEvent(e);
      if (days !== null) {
        if (days < 0) return false;
        if (mapFilterDays !== null && days > mapFilterDays) return false;
      }

      // Visibility (public / private / all)
      if (!matchesVisibilityFilter(e, mapFilterVisibility)) return false;

      // My status / RSVP / creator
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

  const handleUserInteract = () => {
    if (followUserRef.current) setFollowUser(false);
  };

  const recenterOnUser = () => {
    if (!mapRef.current) return;

    // DIAGNOSTIC LOG — confirms the function is actually invoked on
    // each FiHome click. Safe to remove once we know the flow works.
    console.log("[Mapview] recenter requested", {
      hasUserCenter: !!userCenter,
      followUser,
    });

    isProgrammaticMoveRef.current = true;
    setFollowUser(true);

    // 1) Immediate visual feedback using the cached fix (if any). The
    //    user sees the map start moving right away instead of waiting
    //    for getCurrentPosition to return.
    if (userCenter) {
      mapRef.current.flyTo(userCenter, 15, { duration: 0.8 });
    }

    // 2) Background refresh with maximumAge:0 — watchPosition can stall
    //    on mobile (screen sleep, backgrounded tab, throttled by the
    //    OS). A one-shot getCurrentPosition forces a fresh reading and
    //    updates userCenter so the next pan/render targets the user's
    //    actual current location, not a stale cache.
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
            // We already flew to the cache above. Refine to the fresh
            // fix with a gentle panTo — re-flying would interrupt the
            // first animation and look glitchy.
            mapRef.current.panTo(next, { animate: true });
          } else {
            // No cache was available — this is our first animation.
            mapRef.current.flyTo(next, 15, { duration: 0.8 });
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

          <UserInteractionWatcher
            isProgRef={isProgrammaticMoveRef}
            onUserInteract={handleUserInteract}
          />

          {userCenter && (
            <Marker
              position={userCenter}
              icon={createUserDotIcon()}
              interactive={false}
              keyboard={false}
            />
          )}

          {visibleEvents.map((event) => (
            <Marker
              key={event.id}
              position={event.position}
              icon={createMarkerAvatar(
                event,
                56,
                event.going_count || 0,
                formatTooltip(event)
              )}
              eventHandlers={{ click: () => handleMarkerClick(event) }}
            />
          ))}
        </MapContainer>
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