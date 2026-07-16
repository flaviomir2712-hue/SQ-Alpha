import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Row, Col, Card, Spinner, Alert } from "react-bootstrap";
import { FiHeart, FiBriefcase, FiMapPin, FiCalendar } from "react-icons/fi";

// =============================================================
// Following — Phase 5b, route /following
// Lists the businesses the current user follows (GET /businesses/following).
// Each card links to the public business page (/business/:id).
// Dark theme, consistent with CompanyHub / EventsList.
// =============================================================

const API = import.meta.env.VITE_BACKEND_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const CSS = `
.following-page {
  min-height: 100dvh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236,72,153,0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef;
  padding-top: 80px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
  overflow-x: hidden;
  overflow-x: clip;
}
.follow-card {
  background: #161922; border: 1px solid #262a36; border-radius: 14px;
  color: #e9ecef; cursor: pointer; overflow: hidden;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.follow-card:hover { border-color: #3a3f55; box-shadow: 0 8px 24px rgba(0,0,0,0.35); transform: translateY(-2px); }
.follow-card-img { width: 100%; height: 130px; object-fit: cover; border-bottom: 1px solid #262a36; }
.follow-card-noimg {
  width: 100%; height: 130px; background: #0b0d12;
  display: flex; align-items: center; justify-content: center; color: #3a3f55;
  border-bottom: 1px solid #262a36;
}
`;

export const Following = () => {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API}/api/businesses/following`, { headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
        setBusinesses(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="following-page">
      <style>{CSS}</style>
      <Container className="py-4">
        <div className="mb-4">
          <h1 className="text-light mb-1 d-flex align-items-center gap-2">
            <FiHeart /> Following
          </h1>
          <p className="text-secondary mb-0">Businesses you follow.</p>
        </div>

        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>
        )}

        {loading ? (
          <div className="text-center py-5 text-secondary"><Spinner animation="border" /></div>
        ) : businesses.length === 0 ? (
          <div className="text-center py-5 text-secondary">
            <FiHeart size={42} className="mb-2" />
            <h5 className="text-light">You're not following anyone yet</h5>
            <div className="small">Open a business page and tap Follow to see it here.</div>
          </div>
        ) : (
          <Row className="g-3" role="list" aria-label="Businesses you follow">
            {businesses.map((b) => (
              <Col xs={12} lg={6} key={b.id} role="listitem">
                <Card className="follow-card h-100">
                  <Card.Body>
                    <div
                      className="d-flex align-items-center gap-3 mb-3"
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/business/${b.id}`)}
                    >
                      {b.profile_picture_url ? (
                        <img
                          src={b.profile_picture_url}
                          alt={b.name}
                          style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#161922", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <FiBriefcase size={22} />
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="text-light fw-semibold text-truncate">{b.name}</div>
                        {b.category && (
                          <div className="small text-secondary text-truncate">{b.category}</div>
                        )}
                        {b.location && (
                          <div className="small text-secondary text-truncate">
                            <FiMapPin size={12} className="me-1" />{b.location}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#9aa0b4", fontWeight: 600, marginBottom: 8 }}>
                      Upcoming events
                    </div>
                    {b.upcoming_events && b.upcoming_events.length > 0 ? (
                      <div className="d-flex flex-column gap-2">
                        {b.upcoming_events.map((ev) => (
                          <div
                            key={ev.id}
                            className="d-flex align-items-center justify-content-between p-2"
                            style={{ background: "#0b0d12", border: "1px solid #262a36", borderRadius: 10, cursor: "pointer" }}
                            onClick={() => navigate(`/map?event=${ev.id}`)}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div className="text-light text-truncate" style={{ fontWeight: 600 }}>{ev.title || "Event"}</div>
                              <div className="small text-secondary text-truncate">
                                <FiCalendar size={12} className="me-1" />
                                {ev.date}{ev.time ? ` · ${ev.time}` : ""}{ev.location ? ` · ${ev.location}` : ""}
                              </div>
                            </div>
                            {ev.participants_count > 0 && (
                              <span className="small text-secondary ms-2" style={{ whiteSpace: "nowrap" }}>{ev.participants_count} going</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="small text-secondary fst-italic">No upcoming events right now.</div>
                    )}
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Container>
    </div>
  );
};

export default Following;
