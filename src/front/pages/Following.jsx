import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Row, Col, Card, Spinner, Alert } from "react-bootstrap";
import { FiHeart, FiBriefcase, FiMapPin } from "react-icons/fi";

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
              <Col xs={6} md={4} lg={3} key={b.id} role="listitem">
                <Card className="follow-card h-100" onClick={() => navigate(`/business/${b.id}`)}>
                  {b.profile_picture_url ? (
                    <img className="follow-card-img" src={b.profile_picture_url} alt={b.name} />
                  ) : (
                    <div className="follow-card-noimg"><FiBriefcase size={32} /></div>
                  )}
                  <Card.Body>
                    <div className="text-light fw-semibold text-truncate">{b.name}</div>
                    {b.category && (
                      <div className="small text-secondary text-truncate">{b.category}</div>
                    )}
                    {b.location && (
                      <div className="small text-secondary text-truncate mt-1">
                        <FiMapPin size={12} className="me-1" />{b.location}
                      </div>
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
