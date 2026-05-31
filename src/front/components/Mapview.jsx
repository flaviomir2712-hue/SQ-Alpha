import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { Container, Spinner, Alert } from "react-bootstrap";
import "leaflet/dist/leaflet.css";

import { createMarkerAvatar } from "./MarkerAvatar";
import MapClickHandler from "./MapClickHandler";
import { EventModal } from "./EventModal";
import "./mapview.css";

// Fallback ultime quand on n'a pas la geoloc de l'utilisateur.
const MADRID = [40.4168, -3.7038];

// Priorite du centre :
//   1. coords GPS de l'utilisateur si on les a
//   2. fallback Madrid sinon
const computeCenter = (userCenter) => userCenter || MADRID;

/**
 * Mapview: vista de mapa autosuficiente.
 *   - fetch de /api/events (retry jusqu'a succes pour absorber les cold-starts)
 *   - geolocalizacion del usuario
 *   - estado de loading / error
 *   - apertura del EventModal (crear al clicar mapa vacio, ver/editar al
 *     clicar un marker existente)
 */
export const Mapview = ({ onMapClick, onMarkerClick, onSaved }) => {
  // ── datos ──────────────────────────────────────────
  const [events, setEvents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [userCenter, setUserCenter] = useState(null);

  // ── modal interno ─────────────────────────────────
  const [modalOpen, setModalOpen]         = useState(false);
  const [activeEventId, setActiveEventId] = useState(null); // null => crear
  const [prefillCoords, setPrefillCoords] = useState(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");

  // ── fetch events (retry jusqu'a succes) ──────────
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

    // Retry exponentiel jusqu'a obtenir une vraie reponse HTTP.
    // On ne s'arrete que sur :
    //   - succes (200)
    //   - reponse non-OK (4xx/5xx) -> on affiche l'erreur, ca ne reviendra pas tout seul
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
        // erreur reseau ("Failed to fetch") : on retente apres un backoff
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
        () => {
          /* permiso denegado o no disponible: usamos fallback Madrid */
        },
        { timeout: 5000 }
      );
    }
  }, []);

  const mapCenter = useMemo(() => computeCenter(userCenter), [userCenter]);

  // ── handlers ──────────────────────────────────────
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

  // ── render ────────────────────────────────────────
  return (
    <Container fluid className="map-page p-0">
      {loading && (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" />
        </div>
      )}

      {error && (
        <Alert variant="danger" className="m-3">
          {error}
        </Alert>
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

          {events.map((event) => (
            <Marker
              key={event.id}
              position={event.position}
              icon={createMarkerAvatar(event.image)}
              eventHandlers={{
                click: () => handleMarkerClick(event),
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
        onSaved={handleSaved}
        onDeleted={() => fetchEvents()}
      />
    </Container>
  );
};

export default Mapview;
