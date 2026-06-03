import { useEffect, useMemo, useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Tabs,
  Tab,
  Badge,
  Button,
  Spinner,
  Alert,
  Form,
  InputGroup,
} from "react-bootstrap";
import {
  FiCalendar,
  FiClock,
  FiMapPin,
  FiUsers,
  FiSearch,
  FiPlus,
  FiImage,
  FiCheckCircle,
  FiHelpCircle,
  FiXCircle,
} from "react-icons/fi";

import { EventModal } from "../components/EventModal";

// =============================================================
// INLINE API + STYLES
// =============================================================
const API = import.meta.env.VITE_BACKEND_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});
const handle = async (res) => {
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
  return data;
};
const apiListEvents = () =>
  fetch(`${API}/api/events`, { headers: authHeaders() }).then(handle);

const apiRsvp = (eventId, rsvp) =>
  fetch(`${API}/api/events/${eventId}/rsvp`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ rsvp }),
  }).then(handle);

const CSS = `
.events-list-page {
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99, 102, 241, 0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236, 72, 153, 0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef;
  padding-top: 80px;
  padding-bottom: 100px;
}
.event-card {
  background: #161922;
  border: 1px solid #262a36;
  border-radius: 14px;
  color: #e9ecef;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
  overflow: hidden;
  bottom: 0px;
}
.event-card:hover {
  border-color: #3a3f55;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  transform: translateY(-2px);
}
.event-card-img {
  width: 100%; height: 140px; object-fit: cover;
  border-bottom: 1px solid #262a36;
}
.event-card-noimg {
  width: 100%; height: 140px;
  background: linear-gradient(135deg, #1e2230, #0f111a);
  display: flex; align-items: center; justify-content: center;
  color: #2a2f42; border-bottom: 1px solid #262a36;
}
.events-list-page .form-control,
.events-list-page .form-control:focus {
  background-color: #0f111a !important;
  color: #e9ecef !important;
  border-color: #2a2f42 !important;
  box-shadow: none;
}
.events-list-page .nav-tabs { border-bottom: 1px solid #262a36; }
.events-list-page .nav-tabs .nav-link {
  color: #adb5bd; background: transparent; border: none;
  border-bottom: 2px solid transparent;
}
.events-list-page .nav-tabs .nav-link.active {
  color: #fff; background: transparent;
  border-bottom: 2px solid #6366f1;
}
.event-meta {
  display: flex; align-items: center; gap: 0.35rem;
  color: #adb5bd; font-size: 0.85rem;
}

/* ── RSVP bar ── */
.rsvp-bar {
  display: flex;
  gap: 4px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #262a36;
}
.rsvp-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 2px;
  border-radius: 8px;
  border: 1px solid #262a36;
  background: #0f111a;
  color: #6c757d;
  font-size: 0.72rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.rsvp-btn:hover { background: #1e2230; color: #e9ecef; }
.rsvp-btn.active-going     { background: rgba(34,211,238,0.15); border-color: #22d3ee; color: #22d3ee; }
.rsvp-btn.active-maybe     { background: rgba(250,204,21,0.15);  border-color: #facc15; color: #facc15; }
.rsvp-btn.active-not_going { background: rgba(244,63,94,0.15);   border-color: #f43f5e; color: #f43f5e; }
.rsvp-btn:disabled { opacity: 0.45; pointer-events: none; }
`;

// =============================================================
// RSVP OPTIONS
// =============================================================
const RSVP_OPTIONS = [
  { value: "going",     label: "Going",     icon: <FiCheckCircle size={12} /> },
  { value: "maybe",     label: "Maybe",     icon: <FiHelpCircle  size={12} /> },
  { value: "not_going", label: "Not going", icon: <FiXCircle     size={12} /> },
];

// =============================================================
// RSVP BAR — self-contained, stops click propagation so it
// doesn't open the modal when the user clicks a button
// =============================================================
const RsvpBar = ({ eventId, initialRsvp, onRsvpChange }) => {
  const [rsvp, setRsvp]     = useState(initialRsvp || null);
  const [saving, setSaving] = useState(false);

  const handleClick = async (e, value) => {
    e.stopPropagation(); // prevent card click → modal open
    if (saving) return;

    // clicking the active button clears it (toggle)
    const next = rsvp === value ? null : value;
    setSaving(true);
    try {
      await apiRsvp(eventId, next);
      setRsvp(next);
      if (onRsvpChange) onRsvpChange(eventId, next);
    } catch {
      // silently ignore — the button just stays where it was
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rsvp-bar" onClick={(e) => e.stopPropagation()}>
      {RSVP_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`rsvp-btn${rsvp === opt.value ? ` active-${opt.value}` : ""}`}
          disabled={saving}
          onClick={(e) => handleClick(e, opt.value)}
        >
          {opt.icon} {opt.label}
        </button>
      ))}
    </div>
  );
};

// =============================================================
// MAIN
// =============================================================
export const EventsList = () => {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("all");
  const [searchQ, setSearchQ] = useState("");

  // EventModal
  const [modalOpen, setModalOpen]         = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const myId = currentUser?.id;

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiListEvents();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const openEvent  = (id) => { setActiveEventId(id); setModalOpen(true); };
  const openCreate = ()    => { setActiveEventId(null); setModalOpen(true); };
  const closeModal = ()    => { setModalOpen(false); setActiveEventId(null); };

  // Update rsvp on a single event in state without a full reload
  const handleRsvpChange = (eventId, newRsvp) => {
    setEvents((prev) =>
      prev.map((ev) => ev.id === eventId ? { ...ev, my_rsvp: newRsvp } : ev)
    );
  };

  // ---- derived ----
  const isPast = (e) => {
    if (!e?.date) return false;
    const d = new Date(e.date);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d <= today;
  };

  const filtered = useMemo(() => {
    let list = events;
    if (tab === "created")      list = list.filter((e) => e.creator_id === myId);
    if (tab === "participated") list = list.filter((e) => isPast(e));

    const q = searchQ.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        (e.title || "").toLowerCase().includes(q) ||
        (e.location || "").toLowerCase().includes(q) ||
        (e.details || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, tab, searchQ, myId]);

  const counts = useMemo(() => ({
    all:          events.length,
    created:      events.filter((e) => e.creator_id === myId).length,
    participated: events.filter((e) => isPast(e)).length,
  }), [events, myId]);

  // Does the current user participate in this event (but is NOT the creator)?
  const isInvitedParticipant = (e) =>
    e.creator_id !== myId &&
    Array.isArray(e.participants) &&
    e.participants.some((p) => p.id === myId);

  return (
    <div className="events-list-page">
      <style>{CSS}</style>

      <Container className="py-4">

        {/* HEADER */}
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-light mb-1 d-flex align-items-center gap-2">
              <FiCalendar /> My Events
            </h1>
            <p className="text-secondary mb-0">
              Manage your quests, invite friends, chat with participants.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <FiPlus className="me-1" /> New event
          </Button>
        </div>

        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}

        {/* SEARCH */}
        <Card className="event-card mb-4" style={{ cursor: "default" }}>
          <Card.Body>
            <InputGroup>
              <InputGroup.Text className="bg-dark border-secondary text-light">
                <FiSearch />
              </InputGroup.Text>
              <Form.Control
                placeholder="Search by title, location or details..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
              {searchQ && (
                <Button variant="outline-secondary" onClick={() => setSearchQ("")}>
                  Clear
                </Button>
              )}
            </InputGroup>
          </Card.Body>
        </Card>

        {/* TABS */}
        <Tabs activeKey={tab} onSelect={(k) => setTab(k)} className="mb-3" fill>
          <Tab eventKey="all"          title={<span>All          <Badge bg="secondary">{counts.all}</Badge></span>} />
          <Tab eventKey="created"      title={<span>Created      <Badge bg="secondary">{counts.created}</Badge></span>} />
          <Tab eventKey="participated" title={<span>Participated <Badge bg="secondary">{counts.participated}</Badge></span>} />
        </Tabs>

        {/* CONTENT */}
        {loading ? (
          <div className="text-center py-5 text-secondary">
            <Spinner animation="border" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-5 text-secondary">
            <FiCalendar size={42} className="mb-2" />
            <h5 className="text-light">No events {searchQ && "match your search"}</h5>
            <div className="small">
              {tab === "created"
                ? "Click 'New event' to create your first one."
                : "Create one or wait for a friend to invite you."}
            </div>
          </div>
        ) : (
          <Row className="g-3">
            {filtered.map((e) => (
              <Col md={6} lg={4} key={e.id}>
                <Card
                  className="event-card h-100"
                  onClick={() => openEvent(e.id)}
                >
                  {e.image ? (
                    <img src={e.image} alt={e.title || "event"} className="event-card-img" />
                  ) : (
                    <div className="event-card-noimg">
                      <FiImage size={42} />
                    </div>
                  )}

                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                      <strong className="text-light text-truncate">
                        {e.title || "(untitled event)"}
                      </strong>
                      {e.creator_id === myId ? (
                        <Badge bg="info">Creator</Badge>
                      ) : (
                        <Badge bg="secondary">Invited</Badge>
                      )}
                    </div>

                    <div className="event-meta mb-1">
                      <FiCalendar /> {e.date} <FiClock className="ms-2" /> {e.time}
                    </div>
                    {e.location && (
                      <div className="event-meta mb-1 text-truncate" title={e.location}>
                        <FiMapPin /> {e.location}
                      </div>
                    )}
                    <div className="event-meta">
                      <FiUsers /> {e.participants_count} participant{e.participants_count !== 1 ? "s" : ""}
                    </div>

                    {/* RSVP bar — only shown to invited participants, not the creator */}
                    {isInvitedParticipant(e) && (
                      <RsvpBar
                        eventId={e.id}
                        initialRsvp={e.my_rsvp}
                        onRsvpChange={handleRsvpChange}
                      />
                    )}
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Container>

      <EventModal
        show={modalOpen}
        onHide={closeModal}
        eventId={activeEventId}
        prefillCoords={null}
        currentUser={currentUser}
        onSaved={reload}
        onDeleted={reload}
      />
    </div>
  );
};

export default EventsList;