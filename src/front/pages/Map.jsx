import React, { useEffect, useState } from "react";
import { Container, Spinner, Alert } from "react-bootstrap";
import { Mapview } from "../components/Mapview";
import { EventModal } from "../components/EventModal";
import "./map.css";

const Map = () => {
  const [events, setEvents]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [userCenter, setUserCenter]       = useState(null);

  // EventModal control
  const [modalOpen, setModalOpen]         = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);   // null => create mode
  const [prefillCoords, setPrefillCoords] = useState(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");

  // ─────────────────────────────────────────
  // FETCH EVENTS
  // ─────────────────────────────────────────
  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = import.meta.env.VITE_BACKEND_URL;
      const token  = localStorage.getItem("token");

      if (!apiUrl) throw new Error("Missing VITE_BACKEND_URL in .env");

      const res = await fetch(`${apiUrl}/api/events`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch events");

      const data = await res.json();
      const normalized = data
        .filter((e) => e.latitude != null && e.longitude != null)
        .map((e) => ({ ...e, position: [e.latitude, e.longitude] }));

      setEvents(normalized);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching events:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { timeout: 5000 }
      );
    }
  }, []);

  // ─────────────────────────────────────────
  // MODAL handlers
  // ─────────────────────────────────────────
  const handleMapClick = (coords) => {
    // click on empty area → create modal prefilled with clicked coords
    setActiveEventId(null);
    setPrefillCoords(coords);
    setModalOpen(true);
  };

  const handleMarkerClick = (event) => {
    // click on existing marker → open event in view/edit mode
    setActiveEventId(event.id);
    setPrefillCoords(null);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setActiveEventId(null);
    setPrefillCoords(null);
  };

  // ─────────────────────────────────────────
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

      <Mapview
        events={events}
        center={userCenter}
        onMapClick={handleMapClick}
        onMarkerClick={handleMarkerClick}
      />

      <EventModal
        show={modalOpen}
        onHide={handleModalClose}
        eventId={activeEventId}
        prefillCoords={prefillCoords}
        currentUser={currentUser}
        onSaved={fetchEvents}
      />
    </Container>
  );
};

export default Map;
