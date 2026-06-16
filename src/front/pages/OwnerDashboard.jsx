import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container, Row, Col, Card, Button, Form, Modal, Spinner, Alert, Badge, Dropdown,
} from "react-bootstrap";
import {
  FiBriefcase, FiPlus, FiStar, FiChevronDown, FiImage, FiMapPin, FiArrowRight,
} from "react-icons/fi";

import { api } from "../services/api";
import { compressAndUpload } from "../utils/uploadImage";

// ════════════════════════════════════════════════════════════════
// OwnerDashboard — route /businesses
// The owner's home for their businesses (wireframe: "modal-profile"
// with the business-name dropdown switcher). Lists every business the
// owner manages, lets them jump to any profile, and create new ones.
// All endpoints already exist (Stage 2): GET /businesses/mine,
// POST /businesses, and each profile lives at /business/:id.
// ════════════════════════════════════════════════════════════════

const CSS = `
.owner-page {
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236,72,153,0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef; padding-top: 80px; padding-bottom: 110px;
}
.owner-inner { max-width: 820px; margin: 0 auto; padding: 0 1rem; }
.owner-head { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 1.4rem; color: #fff; margin-bottom: 1rem; }
.owner-card { background: #161922; border: 1px solid #262a36; border-radius: 14px; color: #e9ecef; cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease; }
.owner-card:hover { transform: translateY(-2px); border-color: #6366f1; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
.owner-card-img { width: 100%; height: 130px; object-fit: cover; border-bottom: 1px solid #262a36; border-radius: 14px 14px 0 0; }
.owner-card-noimg { width: 100%; height: 130px; display: flex; align-items: center; justify-content: center; color: #2a2f42; background: linear-gradient(135deg,#1e2230,#0f111a); border-radius: 14px 14px 0 0; }
/* Switcher dropdown (the wireframe gesture) */
.owner-switch-toggle.dropdown-toggle::after { display: none; }
.owner-switch-toggle {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  width: 100%; max-width: 420px;
  background: #0f111a !important; border: 1px solid #2a2f42 !important; color: #fff !important;
  border-radius: 12px !important; padding: 0.7rem 0.9rem !important; font-weight: 600;
}
.owner-switch-toggle:hover { border-color: #6366f1 !important; }
.owner-switch-menu { background: #161922; border: 1px solid #262a36; min-width: 280px; }
.owner-switch-menu .dropdown-item { color: #e9ecef; }
.owner-switch-menu .dropdown-item:hover { background: #1e2230; color: #fff; }
.owner-switch-menu .dropdown-divider { border-color: #262a36; }
.owner-page .form-control, .owner-page .form-control:focus,
.owner-page .form-select, .owner-page .form-select:focus,
.owner-modal .form-control, .owner-modal .form-control:focus,
.owner-modal .form-select, .owner-modal .form-select:focus {
  background-color: #0f111a !important; color: #e9ecef !important; border-color: #2a2f42 !important; box-shadow: none;
}
.owner-modal .modal-content { background: #161922; color: #e9ecef; border: 1px solid #262a36; border-radius: 14px; }
.owner-modal .modal-header, .owner-modal .modal-footer { border-color: #262a36; }
.owner-thumb { width: 100px; height: 100px; border-radius: 14px; object-fit: cover; border: 3px solid #6366f1; background: #0f111a; }
.owner-thumb-fallback { width: 100px; height: 100px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg,#1e2230,#0f111a); color: #3a3f55; border: 1px solid #262a36; }
.sq-grad-btn { background: linear-gradient(135deg,#6366f1,#4f46e5); border: none; font-weight: 600; }
.sq-grad-btn:hover, .sq-grad-btn:focus { background: linear-gradient(135deg,#4f46e5,#4338ca); }
.owner-stars svg { color: #f5b301; }
`;

const CATEGORIES = [
  ["", "Select a category…"], ["restaurant", "Restaurant"], ["bar", "Bar"],
  ["cafe", "Café"], ["brand", "Clothing / brand"], ["shop", "Shop"], ["other", "Other"],
];

export const OwnerDashboard = () => {
  const navigate = useNavigate();

  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // create modal
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", location: "", description: "", profile_picture_url: "" });
  const photoRef = useRef(null);

  const showToast = (text, variant = "success") => {
    setToast({ text, variant });
    setTimeout(() => setToast(null), 2200);
  };

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setBusinesses(await api.get("/businesses/mine"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const pickPhoto = () => photoRef.current?.click();
  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await compressAndUpload(file, "profile");
      setForm((f) => ({ ...f, profile_picture_url: url }));
    } catch { showToast("Image upload failed", "danger"); }
  };

  const openCreate = () => {
    setForm({ name: "", category: "", location: "", description: "", profile_picture_url: "" });
    setCreating(true);
  };

  const submitCreate = async () => {
    if (!form.name.trim()) { showToast("Business name is required", "danger"); return; }
    setSaving(true);
    try {
      const data = await api.post("/businesses", form);
      setCreating(false);
      showToast("Business created");
      await reload();
      if (data?.business?.id) navigate(`/business/${data.business.id}`);
    } catch (e) { showToast(e.message, "danger"); }
    finally { setSaving(false); }
  };

  return (
    <div className="owner-page">
      <style>{CSS}</style>
      <Container>
        <div className="owner-inner">
          <div className="owner-head"><FiBriefcase /> My businesses</div>

          {toast && <Alert variant={toast.variant} className="py-2">{toast.text}</Alert>}
          {error && <Alert variant="danger">{error}</Alert>}

          {loading ? (
            <div className="text-center py-5"><Spinner animation="border" /></div>
          ) : businesses.length === 0 ? (
            <Card className="owner-card" style={{ cursor: "default" }}>
              <Card.Body className="text-center py-5">
                <FiBriefcase size={42} className="mb-3" style={{ color: "#3a3f55" }} />
                <h5 className="text-light">You don't manage any business yet</h5>
                <p className="text-secondary small mb-3">
                  Create one to get a public profile with events, posts and reviews.
                </p>
                <Button className="sq-grad-btn" onClick={openCreate}>
                  <FiPlus className="me-1" /> Create a business
                </Button>
              </Card.Body>
            </Card>
          ) : (
            <>
              {/* SWITCHER — the wireframe's "business name ▼ → business 1 / 2" */}
              <div className="mb-4">
                <div className="text-secondary small text-uppercase mb-2" style={{ letterSpacing: "0.05em" }}>
                  Switch profile
                </div>
                <Dropdown>
                  <Dropdown.Toggle as={Button} className="owner-switch-toggle">
                    <span className="text-truncate">{businesses[0].name}</span>
                    <FiChevronDown />
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="owner-switch-menu">
                    {businesses.map((b) => (
                      <Dropdown.Item key={b.id} onClick={() => navigate(`/business/${b.id}`)}>
                        <FiBriefcase className="me-2" />{b.name}
                      </Dropdown.Item>
                    ))}
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={openCreate}>
                      <FiPlus className="me-2" /> New business
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </div>

              {/* CARDS */}
              <Row className="g-3">
                {businesses.map((b) => (
                  <Col md={6} key={b.id}>
                    <Card className="owner-card h-100" onClick={() => navigate(`/business/${b.id}`)}>
                      {b.profile_picture_url ? (
                        <img src={b.profile_picture_url} alt={b.name} className="owner-card-img" />
                      ) : (
                        <div className="owner-card-noimg"><FiBriefcase size={36} /></div>
                      )}
                      <Card.Body>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <strong className="text-light">{b.name}</strong>
                          {b.category && <Badge bg="secondary" className="text-capitalize">{b.category}</Badge>}
                        </div>
                        {b.location && (
                          <div className="small text-secondary mt-1 text-truncate">
                            <FiMapPin size={12} className="me-1" />{b.location}
                          </div>
                        )}
                        <div className="small text-secondary mt-2 d-flex align-items-center gap-3">
                          {b.rating != null ? (
                            <span className="owner-stars"><FiStar size={13} style={{ fill: "currentColor" }} /> {b.rating}</span>
                          ) : (
                            <span>No reviews</span>
                          )}
                          <span>{b.events_count} event{b.events_count === 1 ? "" : "s"}</span>
                          <span>{b.posts_count} post{b.posts_count === 1 ? "" : "s"}</span>
                          <span className="ms-auto text-primary"><FiArrowRight /></span>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>

              <div className="text-center mt-4">
                <Button variant="outline-light" onClick={openCreate}>
                  <FiPlus className="me-1" /> Add another business
                </Button>
              </div>
            </>
          )}
        </div>
      </Container>

      {/* CREATE MODAL */}
      <Modal show={creating} onHide={() => setCreating(false)} centered dialogClassName="owner-modal">
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title>New business</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center mb-3">
            {form.profile_picture_url ? (
              <img src={form.profile_picture_url} alt="" className="owner-thumb" />
            ) : (
              <div className="owner-thumb-fallback mx-auto"><FiBriefcase size={34} /></div>
            )}
            <div className="mt-2">
              <Button variant="outline-light" size="sm" onClick={pickPhoto}>
                <FiImage className="me-1" /> {form.profile_picture_url ? "Change photo" : "Add photo"}
              </Button>
              <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
            </div>
          </div>
          <Row>
            <Col md={7} className="mb-3">
              <Form.Label>Name</Form.Label>
              <Form.Control name="name" value={form.name} onChange={setField} placeholder="e.g. Café Aurora" />
            </Col>
            <Col md={5} className="mb-3">
              <Form.Label>Category</Form.Label>
              <Form.Select name="category" value={form.category} onChange={setField}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Form.Select>
            </Col>
          </Row>
          <Form.Group className="mb-3">
            <Form.Label>Location</Form.Label>
            <Form.Control name="location" value={form.location} onChange={setField} placeholder="Street, city" />
          </Form.Group>
          <Form.Group>
            <Form.Label>Description</Form.Label>
            <Form.Control as="textarea" rows={2} name="description" value={form.description} onChange={setField} />
          </Form.Group>
          <p className="text-secondary small mt-2 mb-0">
            You can set opening hours, events, posts and more from the business profile.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-light" onClick={() => setCreating(false)}>Cancel</Button>
          <Button className="sq-grad-btn" onClick={submitCreate} disabled={saving}>
            {saving ? "Creating…" : "Create business"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default OwnerDashboard;
