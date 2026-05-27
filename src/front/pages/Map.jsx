import React, { useEffect, useState } from "react";
import { Container, Card, Button, Spinner, Alert } from "react-bootstrap";
import { Mapview } from "../components/Mapview";
import "./map.css";

const Map = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [userCenter, setUserCenter] = useState(null);

  useEffect(() => {
    fetchEvents();

    // Intentar centrar el mapa en la ubicacion del usuario (silenciosamente)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setUserCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {
          /* el usuario nego permiso o no esta disponible: usamos default */
        },
        { timeout: 5000 }
      );
    }
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = import.meta.env.VITE_BACKEND_URL;
      if (!apiUrl) {
        throw new Error(
          "Falta VITE_BACKEND_URL en el .env del frontend"
        );
      }

      const response = await fetch(`${apiUrl}/api/events`);
      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }

      const data = await response.json();

      // El backend entrega latitude/longitude por separado. Lo convertimos
      // a [lat, lng] que es lo que espera react-leaflet.
      const normalized = data.map((e) => ({
        ...e,
        position: [e.latitude, e.longitude],
      }));

      setEvents(normalized);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching events:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAttendEvent = async (eventId) => {
    try {
      const apiUrl = import.meta.env.VITE_BACKEND_URL;
      const token = sessionStorage.getItem("token");

      const response = await fetch(
        `${apiUrl}/api/events/${eventId}/attend`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      if (!response.ok) throw new Error("Failed to attend event");

      setSelectedEvent(null);
      fetchEvents();
    } catch (err) {
      console.error("Error attending event:", err);
    }
  };

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" />
      </Container>
    );
  }

  return (
    <Container fluid className="map-page p-0">
      {error && (
        <Alert variant="danger" className="m-3">
          {error}
        </Alert>
      )}

      <Mapview
        events={events}
        setSelectedEvent={setSelectedEvent}
        center={userCenter}
      />

      {selectedEvent && (
        <div
          className="event-modal-overlay"
          onClick={() => setSelectedEvent(null)}
        >
          <Card
            className="event-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <Card.Body>
              <Card.Title>{selectedEvent.title}</Card.Title>

              {selectedEvent.category && (
                <p className="event-category">
                  <span className="badge bg-info">
                    {selectedEvent.category}
                  </span>
                </p>
              )}

              <p className="event-info">
                <strong>Location:</strong>{" "}
                {selectedEvent.location?.name || "Location TBD"}
              </p>

              <p className="event-info">
                <strong>Date:</strong>{" "}
                {selectedEvent.event_date
                  ? new Date(selectedEvent.event_date).toLocaleString()
                  : "TBD"}
              </p>

              <p className="event-info">
                <strong>Attendees:</strong>{" "}
                {selectedEvent.attendee_count ?? 0} /{" "}
                {selectedEvent.max_attendees ?? "∞"}
              </p>

              {selectedEvent.description && (
                <p className="event-description">
                  {selectedEvent.description}
                </p>
              )}

              <div className="modal-actions">
                <Button
                  variant="primary"
                  onClick={() => handleAttendEvent(selectedEvent.id)}
                >
                  Attend Event
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => setSelectedEvent(null)}
                >
                  Close
                </Button>
              </div>
            </Card.Body>
          </Card>
        </div>
      )}
    </Container>
  );
};

export default Map;
