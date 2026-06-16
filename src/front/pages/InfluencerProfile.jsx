import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Row, Col, Card, Button, Form, Spinner, Alert, Badge } from "react-bootstrap";
import {
  FiMapPin, FiMail, FiCalendar, FiClock, FiStar, FiArrowLeft,
  FiImage, FiMessageCircle, FiEdit2, FiTrash2, FiUser,
} from "react-icons/fi";

import { api } from "../services/api";

// ════════════════════════════════════════════════════════════════
// InfluencerProfile — route /influencer/:id
// Shows (per spec): picture, homebase, @username, name, professional
// email, and "Places went" — the events they attended, where the usual
// "Details" button becomes "@username's opinion".
// ════════════════════════════════════════════════════════════════

const CSS = `
.inf-page {
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236,72,153,0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef; padding-top: 80px; padding-bottom: 110px;
}
.inf-card { background: #161922; border: 1px solid #262a36; border-radius: 14px; color: #e9ecef; }
.inf-avatar { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #6366f1; background: #0f111a; }
.inf-avatar-fallback {
  width: 120px; height: 120px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #6366f1, #ec4899); color: #fff; font-size: 2.2rem; font-weight: 700;
}
.inf-section-title { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #8a90a2; font-weight: 600; margin-bottom: 0.75rem; }
.inf-event-card { background: #0f111a; border: 1px solid #262a36; border-radius: 12px; overflow: hidden; height: 100%; display: flex; flex-direction: column; }
.inf-event-img { width: 100%; height: 120px; object-fit: cover; border-bottom: 1px solid #262a36; }
.inf-event-noimg { width: 100%; height: 120px; display: flex; align-items: center; justify-content: center; color: #2a2f42; background: linear-gradient(135deg,#1e2230,#0f111a); }
.inf-opinion-box { background: #14171f; border: 1px solid #262a36; border-radius: 10px; padding: 0.6rem 0.7rem; margin-top: 0.5rem; }
.inf-stars svg { color: #f5b301; }
.inf-page .form-control, .inf-page .form-control:focus {
  background-color: #0f111a !important; color: #e9ecef !important; border-color: #2a2f42 !important; box-shadow: none;
}
.sq-grad-btn { background: linear-gradient(135deg,#6366f1,#4f46e5); border: none; font-weight: 600; }
.sq-grad-btn:hover, .sq-grad-btn:focus { background: linear-gradient(135deg,#4f46e5,#4338ca); }
.inf-opinion-btn { color: #6366f1 !important; border-color: #3a3f7a !important; }
.inf-opinion-btn:hover { background: rgba(99,102,241,0.12) !important; color: #a5b4fc !important; }
`;

const initials = (u) => {
  const f = (u?.first_name || "").trim().charAt(0);
  const l = (u?.last_name || "").trim().charAt(0);
  if (f || l) return `${f}${l}`.toUpperCase();
  return (u?.username || "?").charAt(0).toUpperCase();
};

const Stars = ({ value = 0, size = 14 }) => (
  <span className="inf-stars d-inline-flex align-items-center gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <FiStar key={n} size={size}
        style={{ fill: n <= Math.round(value) ? "currentColor" : "none", color: n <= Math.round(value) ? undefined : "#3a3f55" }} />
    ))}
  </span>
);

export const InfluencerProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // which event's opinion is expanded / being edited
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [draftRating, setDraftRating] = useState(0);
  const [busy, setBusy] = useState(false);

  const showToast = (text, variant = "success") => {
    setToast({ text, variant });
    setTimeout(() => setToast(null), 2200);
  };

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await api.get(`/influencer/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const username = data?.username ? `@${data.username}` : "this creator";

  const beginEdit = (ev) => {
    setEditId(ev.id);
    setOpenId(ev.id);
    setDraftText(ev.opinion?.text || "");
    setDraftRating(ev.opinion?.rating || 0);
  };
  const cancelEdit = () => { setEditId(null); setDraftText(""); setDraftRating(0); };

  const saveOpinion = async (eventId) => {
    setBusy(true);
    try {
      await api.post(`/events/${eventId}/opinion`, {
        text: draftText || null,
        rating: draftRating || null,
      });
      showToast("Opinion saved");
      cancelEdit();
      reload();
    } catch (e) { showToast(e.message, "danger"); }
    finally { setBusy(false); }
  };

  const deleteOpinion = async (eventId) => {
    setBusy(true);
    try {
      await api.del(`/events/${eventId}/opinion`);
      showToast("Opinion removed");
      cancelEdit();
      reload();
    } catch (e) { showToast(e.message, "danger"); }
    finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="inf-page"><style>{CSS}</style>
        <Container className="text-center py-5"><Spinner animation="border" /></Container>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="inf-page"><style>{CSS}</style>
        <Container className="py-5">
          <Alert variant="danger">{error || "Influencer not found"}</Alert>
          <Button variant="outline-light" size="sm" onClick={() => navigate(-1)}>
            <FiArrowLeft className="me-1" /> Back
          </Button>
        </Container>
      </div>
    );
  }

  const isSelf = !!data.is_self;
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();

  return (
    <div className="inf-page">
      <style>{CSS}</style>
      <Container>
        <div className="mb-3">
          <Button variant="outline-light" size="sm" onClick={() => navigate(-1)}>
            <FiArrowLeft className="me-1" /> Back
          </Button>
        </div>

        {toast && <Alert variant={toast.variant} className="py-2">{toast.text}</Alert>}

        {/* HERO */}
        <Card className="inf-card mb-4">
          <Card.Body>
            <Row className="align-items-center g-4">
              <Col xs={12} md="auto" className="text-center">
                {data.profile_picture_url ? (
                  <img src={data.profile_picture_url} alt={data.username} className="inf-avatar"
                    onError={(e) => { e.target.style.display = "none"; }} />
                ) : (
                  <div className="inf-avatar inf-avatar-fallback">{initials(data)}</div>
                )}
              </Col>
              <Col>
                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-light mb-0">{fullName || data.username}</h1>
                  <Badge bg="secondary">Influencer</Badge>
                </div>
                {data.username && <div className="text-secondary mb-2">@{data.username}</div>}
                {data.bio && <p className="text-light mb-2">{data.bio}</p>}
                <div className="d-flex flex-wrap gap-3 small text-secondary">
                  {data.homebase && <span><FiMapPin className="me-1" />{data.homebase}</span>}
                  {data.professional_email && <span><FiMail className="me-1" />{data.professional_email}</span>}
                </div>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* PLACES WENT */}
        <Card className="inf-card">
          <Card.Body>
            <div className="inf-section-title"><FiCalendar className="me-1" /> Places went</div>
            {data.places_went.length === 0 ? (
              <div className="text-secondary small">No places yet.</div>
            ) : (
              <Row className="g-3">
                {data.places_went.map((ev) => {
                  const op = ev.opinion;
                  const expanded = openId === ev.id;
                  const editing = editId === ev.id;
                  return (
                    <Col md={6} lg={4} key={ev.id}>
                      <div className="inf-event-card">
                        {ev.image ? (
                          <img src={ev.image} alt={ev.title} className="inf-event-img" />
                        ) : (
                          <div className="inf-event-noimg"><FiImage size={32} /></div>
                        )}
                        <div className="p-2 d-flex flex-column flex-grow-1">
                          <div className="fw-semibold text-light text-truncate">{ev.title || "(untitled)"}</div>
                          <div className="small text-secondary mb-1">
                            <FiCalendar size={12} className="me-1" />{ev.date} <FiClock size={12} className="ms-2 me-1" />{ev.time}
                          </div>
                          {ev.location && (
                            <div className="small text-secondary text-truncate mb-2">
                              <FiMapPin size={12} className="me-1" />{ev.location}
                            </div>
                          )}

                          <div className="mt-auto">
                            {/* The card's action — "Details" becomes the influencer's opinion */}
                            {op || isSelf ? (
                              <Button
                                size="sm"
                                variant="outline-primary"
                                className="inf-opinion-btn w-100"
                                onClick={() => {
                                  if (editing) return;
                                  setOpenId(expanded ? null : ev.id);
                                }}
                              >
                                <FiMessageCircle className="me-1" />
                                {op ? `${username}'s opinion` : "Add your opinion"}
                              </Button>
                            ) : (
                              <span className="small text-secondary fst-italic">No opinion yet</span>
                            )}

                            {expanded && (
                              <div className="inf-opinion-box">
                                {editing ? (
                                  <>
                                    <div className="mb-2">
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <FiStar key={n} size={20} style={{ cursor: "pointer", marginRight: 3,
                                          color: n <= draftRating ? "#f5b301" : "#3a3f55",
                                          fill: n <= draftRating ? "#f5b301" : "none" }}
                                          onClick={() => setDraftRating(n)} />
                                      ))}
                                    </div>
                                    <Form.Control as="textarea" rows={2} className="mb-2"
                                      placeholder="What did you think of this place?"
                                      value={draftText} onChange={(e) => setDraftText(e.target.value)} />
                                    <div className="d-flex gap-2">
                                      <Button size="sm" className="sq-grad-btn" disabled={busy} onClick={() => saveOpinion(ev.id)}>
                                        Save
                                      </Button>
                                      <Button size="sm" variant="outline-light" onClick={cancelEdit}>Cancel</Button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    {op?.rating != null && <div className="mb-1"><Stars value={op.rating} /></div>}
                                    {op?.text ? (
                                      <div className="small text-light">{op.text}</div>
                                    ) : (
                                      <div className="small text-secondary fst-italic">No opinion written yet.</div>
                                    )}
                                    {isSelf && (
                                      <div className="d-flex gap-2 mt-2">
                                        <Button size="sm" variant="outline-light" onClick={() => beginEdit(ev)}>
                                          <FiEdit2 size={13} className="me-1" />{op ? "Edit" : "Add"}
                                        </Button>
                                        {op && (
                                          <Button size="sm" variant="link" className="text-danger p-0" onClick={() => deleteOpinion(ev.id)}>
                                            <FiTrash2 size={13} /> remove
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            )}
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};

export default InfluencerProfile;
