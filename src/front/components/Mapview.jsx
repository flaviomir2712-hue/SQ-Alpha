import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet";
import { Container, Spinner, Alert } from "react-bootstrap";
import "leaflet/dist/leaflet.css";

import useGlobalReducer from "../hooks/useGlobalReducer";
import { createMarkerAvatar, pickMarkerImage } from "./MarkerAvatar";
import MapClickHandler from "./MapClickHandler";
import { EventModal } from "./EventModal";
import "./mapview.css";

const MADRID = [40.4168, -3.7038];
const computeCenter = (userCenter) => userCenter || MADRID;

// Tooltip text helpers
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Days from today to the event date. Negative = past.
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
  const when = formatDaysUntil(daysUntilEvent(event));
  const time = event.time || "";
  return [title, when, time].filter(Boolean).join(" · ");
};

/**
 * Mapview: vista de mapa autosuficiente.
 *   - fetch de /api/events con retry
 *   - geolocalizacion del usuario
 *   - filtra eventos pendientes (sin respuesta) → no se ven hasta aceptar
 *   - filtra eventos pasados → no se ven en el mapa
 *   - aplica el filtro temporal (mapFilterDays) desde el store
 *   - tooltip al hover (título · días · hora)
 *   - badge con número de "going" en el marker
 *   - imagen del marker: event.image → creator.profile_picture → logo SQ
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

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");

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

  useEffect(() => {
    fetchEvents();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCenter([pos.coords.latitude, pos.coords.longitude]),
        () => { /* permission denied — fallback to Madrid */ },
        { timeout: 5000 }
      );
    }
  }, []);

  const mapCenter = useMemo(() => computeCenter(userCenter), [userCenter]);

  // Apply all filters: pending invitations hidden, past events hidden,
  // temporal filter applied if set.
  const visibleEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return events.filter((e) => {
      // Hide if the current user has a pending invitation (not yet responded).
      if (e.my_status === "pending") return false;
      // Hide past events.
      const days = daysUntilEvent(e);
      if (days === null) return true; // keep events with unparseable dates rather than hide them
      if (days < 0) return false;
      // Apply temporal filter if set.
      if (mapFilterDays !== null && days > mapFilterDays) return false;
      return true;
    });
  }, [events, mapFilterDays]);

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
        style={{ height: "calc(100vh - 56px - 64px)", width: "100%" }}
      >
        <MapContainer
          center={mapCenter}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          <MapClickHandler onMapClick={handleMapClick} />

          {visibleEvents.map((event) => (
            <Marker
              key={event.id}
              position={event.position}
              icon={createMarkerAvatar(
                pickMarkerImage(event),
                56,
                event.going_count || 0
              )}
              eventHandlers={{ click: () => handleMarkerClick(event) }}
            >
              <Tooltip
                direction="top"
                offset={[0, -56]}
                opacity={0.95}
                className="sq-marker-tooltip"
              >
                {formatTooltip(event)}
              </Tooltip>
            </Marker>
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