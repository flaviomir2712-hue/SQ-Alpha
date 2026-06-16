import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Button, Spinner, Alert } from 'react-bootstrap';
import './explore.css';

const Explore = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, [selectedCategory]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const backendUrl = document.querySelector('[data-backend-url]')?.getAttribute('data-backend-url') || 'http://localhost:3001';
      const url = selectedCategory
        ? `${backendUrl}/api/events?category=${selectedCategory}`
        : `${backendUrl}/api/events`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }

      const data = await response.json();
      setEvents(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAttendEvent = async (eventId) => {
    try {
      const backendUrl = document.querySelector('[data-backend-url]')?.getAttribute('data-backend-url') || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/events/${eventId}/attend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        fetchEvents();
      } else {
        alert('Failed to attend event');
      }
    } catch (err) {
      console.error('Error attending event:', err);
      alert('Error attending event');
    }
  };

  const categories = ['sports', 'music', 'social', 'arts', 'tech', 'food'];

  if (loading && events.length === 0) {
    return (
      <Container className="explore-container mt-5">
        <div className="text-center">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading events...</span>
          </Spinner>
        </div>
      </Container>
    );
  }

  return (
    <Container className="explore-container py-4">
      <h1 className="mb-4">Discover Events Near You</h1>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="category-filter mb-4">
        <Button
          variant={selectedCategory === null ? 'primary' : 'outline-primary'}
          onClick={() => setSelectedCategory(null)}
          className="me-2 mb-2"
        >
          All Events
        </Button>
        {categories.map(cat => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? 'primary' : 'outline-primary'}
            onClick={() => setSelectedCategory(cat)}
            className="me-2 mb-2"
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </Button>
        ))}
      </div>

      {events.length === 0 ? (
        <Alert variant="info">No events found. Try another category!</Alert>
      ) : (
        <Row>
          {events.map(event => (
            <Col md={6} lg={4} key={event.id} className="mb-4">
              <Card className="event-card h-100 shadow-sm">
                {event.image_url && (
                  <Card.Img
                    variant="top"
                    src={event.image_url}
                    alt={event.title}
                    className="event-image"
                  />
                )}
                <Card.Body>
                  <div className="mb-2">
                    <span className="badge bg-info">{event.category || 'Event'}</span>
                  </div>
                  <Card.Title className="event-title">{event.title}</Card.Title>

                  <div className="event-details mb-3">
                    <p className="text-muted small">
                      📍 {event.location?.name || 'Location TBD'}
                    </p>
                    <p className="text-muted small">
                      🗓️ {new Date(event.event_date).toLocaleDateString()}
                    </p>
                    <p className="text-muted small">
                      👥 {event.attendee_count} attendees
                      {event.max_attendees && ` / ${event.max_attendees}`}
                    </p>
                  </div>

                  {event.description && (
                    <Card.Text className="event-description">
                      {event.description.substring(0, 100)}...
                    </Card.Text>
                  )}

                  <div className="d-flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-grow-1"
                      onClick={() => handleAttendEvent(event.id)}
                    >
                      Attend
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="flex-grow-1"
                    >
                      Details
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Container>
  );
};

export default Explore;
