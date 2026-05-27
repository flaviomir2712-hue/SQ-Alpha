import React, { useEffect, useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Spinner,
  Alert,
  Badge
} from "react-bootstrap";

import "./profile.css";

const API_URL = import.meta.env.VITE_BACKEND_URL;

const Profile = () => {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("attended");

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("token")}`
  });

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      // USER
      fetch(`${API_URL}/api/users/me`, {
        headers: authHeaders()
      });

      if (!userRes.ok) throw new Error("Failed to load profile");

      const userData = await userRes.json();
      setUser(userData);

      // EVENTS
      fetch(
        `${API_URL}/api/users/me/events`,
        {
          headers: authHeaders()
        }
      );

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setEvents(eventsData);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (!user) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">User not found</Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4">

      {error && <Alert variant="danger">{error}</Alert>}

      {/* HEADER */}
      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <Row>

            <Col md={3} className="text-center">
              {user.profile_picture_url ? (
                <img
                  src={user.profile_picture_url}
                  alt="avatar"
                  style={{ width: 100, height: 100, borderRadius: "50%" }}
                />
              ) : (
                <div
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: "50%",
                    background: "#ddd",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 30
                  }}
                >
                  {user.username?.charAt(0)?.toUpperCase()}
                </div>
              )}
            </Col>

            <Col md={6}>
              <h3>
                {user.first_name} {user.last_name}
              </h3>

              <p className="text-muted">@{user.username}</p>

              <p>{user.bio || "No bio"}</p>

              <div className="d-flex gap-3">
                <div>
                  <strong>{events.length}</strong> Events
                </div>
                <div>
                  <strong>{user.friends_count || 0}</strong> Friends
                </div>
              </div>
            </Col>

            <Col md={3} className="text-end">
              <Button variant="primary" className="mb-2 w-100">
                Edit
              </Button>

              <Button
                variant="outline-danger"
                className="w-100"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </Col>

          </Row>
        </Card.Body>
      </Card>

      {/* TABS */}
      <div className="mb-4">
        <Button
          className="me-2"
          variant={tab === "attended" ? "primary" : "outline-primary"}
          onClick={() => setTab("attended")}
        >
          Attended
        </Button>

        <Button
          variant={tab === "created" ? "primary" : "outline-primary"}
          onClick={() => setTab("created")}
        >
          Created
        </Button>
      </div>

      {/* ATTENDED */}
      {tab === "attended" && (
        <>
          {events.length === 0 ? (
            <Alert variant="info">No events yet</Alert>
          ) : (
            <Row>
              {events.map((event) => (
                <Col md={4} key={event.id} className="mb-3">
                  <Card>
                    {event.image_url && (
                      <Card.Img src={event.image_url} />
                    )}

                    <Card.Body>
                      <Badge bg="info">{event.category}</Badge>

                      <h5>{event.title}</h5>

                      <small className="text-muted">
                        📍 {event.location?.name || "TBD"}
                      </small>

                      <br />

                      <small className="text-muted">
                        🗓 {new Date(event.event_date).toLocaleDateString()}
                      </small>

                      <p className="mt-2">
                        {event.description?.slice(0, 80)}
                      </p>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </>
      )}

      {/* CREATED */}
      {tab === "created" && (
        <Alert variant="info">
          No created events yet
        </Alert>
      )}

    </Container>
  );
};

export default Profile;