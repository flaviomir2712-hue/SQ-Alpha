import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { createMarkerAvatar } from "./MarkerAvatar";
import MapClickHandler from "./MapClickHandler";
import { EventModal } from "./EventModal";

// Fallback par défaut : Madrid
const MADRID = [40.4168, -3.7038];

// Distance haversine en km entre deux [lat, lng]
const haversine = (a, b) => {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * Priority chain for the map center:
 *   1. The user's GPS position (`center` prop).
 *   2. The event closest to Madrid (best proxy when no user location).
 *   3. Madrid as the absolute fallback.
 */
const computeCenter = (center, events) => {
  if (center) return center;

  if (events && events.length > 0) {
    const sorted = [...events]
      .filter((e) => Array.isArray(e.position))
      .sort(
        (a, b) =>
          haversine(MADRID, a.position) - haversine(MADRID, b.position)
      );
    if (sorted.length > 0) return sorted[0].position;
  }

  return MADRID;
};

/**
 * Mapview is now self-contained: it owns the EventModal.
 *   - click on empty area  -> opens EventModal in create mode (prefilled coords)
 *   - click on existing marker -> opens EventModal in view/edit mode
 *
 * Optional props (forwarded callbacks for the parent to react if needed):
 *   onMapClick(coords)     -> still fired after the modal opens
 *   onMarkerClick(event)   -> still fired after the modal opens
 *   onSaved(eventOrNull)   -> called after a create/update finishes
 */
export const Mapview = ({
  events = [],
  center,
  onMapClick,
  onMarkerClick,
  onSaved = () => {},
}) => {
  const mapCenter = useMemo(
    () => computeCenter(center, events),
    [center, events]
  );

  // ── internal modal state ──────────────────────────
  const [modalOpen, setModalOpen]         = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);
  const [prefillCoords, setPrefillCoords] = useState(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");

  // ── handlers ──────────────────────────────────────
  const handleMapClick = (coords) => {
    console.log("[Mapview] open create modal at", coords);
    setActiveEventId(null);
    setPrefillCoords(coords);
    setModalOpen(true);
    onMapClick && onMapClick(coords);
  };

  const handleMarkerClick = (event) => {
    console.log("[Mapview] open existing event", event.id);
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

  return (
    <>
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
            attribution="OpenStreetMap"
          />

          <MapClickHandler
            onMapClick={(coords) => {
              console.debug("[Mapview] map click", coords);
              handleMapClick(coords);
            }}
          />

          {events.map((event) => (
            <Marker
              key={event.id}
              position={event.position}
              icon={createMarkerAvatar(event.image)}
              eventHandlers={{
                click: () => {
                  console.debug("[Mapview] marker click", event.id);
                  handleMarkerClick(event);
                },
              }}
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
        onSaved={onSaved}
      />
    </>
  );
};

export default Mapview;
