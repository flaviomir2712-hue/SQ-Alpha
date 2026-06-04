import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

// Unified response (going/maybe/not_going). Works for invitees (joins them
// or declines the invitation) AND participants (just updates rsvp).
const apiRespond = (eventId, response) =>
  fetch(`${API}/api/events/${eventId}/respond`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ response }),
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

/* Status pill in card top-right */
.status-pill {
  font-size: 0.65rem !important;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.status-pill.pending  { background: #facc15 !important; color: #0b0d12 !important; }
.status-pill.accepted { background: #4f46e5 !important; }
.status-pill.creator  { background: #22d3ee !important; color: #0b0d12 !important; }
`;

// =============================================================
// RESPONSE OPTIONS
// =============================================================
const RESPONSE_OPTIONS = [
  { value: "going",     label: "Voy",     icon: <FiCheckCircle size={12} /> },
  { value: "maybe",     label: "Tal vez", icon: <FiHelpCircle  size={12} /> },
  { value: "not_going", label: "No voy",  icon: <FiXCircle     size={12} /> },
];

// =============================================================
// RESPONSE BAR — self-contained, stops click propagation so it
// doesn't open the modal when the user clicks a button
// =============================================================
const ResponseBar = ({ eventId, myStatus, initialRsvp, onChanged }) => {
  const [rsvp, setRsvp]     = useState(initialRsvp || null);
  const [saving, setSaving] = useState(false);

  const handleClick = async (e, value) => {
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      const data = await apiRespond(eventId, value);
      // /respond returns the updated event — pull my_rsvp from it.
      const next = data?.event?.my_rsvp ?? value;
      setRsvp(next);
      if (onChanged) onChanged(eventId, data?.event || null);
    } catch {
      // silently ignore — the button just stays where it was
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rsvp-bar" onClick={(e) => e.stopPropagation()}>
      {RESPONSE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`rsvp-btn${rsvp === opt.value ? ` active-${opt.value}` : ""}`}
          disabled={saving}
          onClick={(e) => handleClick(e, opt.value)}
          title={
            myStatus === "pending"
              ? (opt.value === "not_going" ? "Rechazar invitación" : `Aceptar (${opt.label})`)
              : opt.label
          }
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
// Navigate to /map?event=<id> — the Mapview component reads this param
// and flies to the event's coords (force-showing the marker even when
// the user has a pending invitation for it).
const goToEventOnMap = (navigate, eventId) => (e) => {
  e.stopPropagation();   // do NOT trigger the card click that opens the modal
  navigate(`/map?event=${eventId}`);
};

export const EventsList = () => {
  const navigate = useNavigate();
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("all");
  const [searchQ, setSearchQ] = useState("");

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

  // Patch a single event in state with the updated payload returned by
  // /respond. Falls back to a full reload when the backend payload is
  // missing the my_status hint (e.g. after declining an invitation).
  const handleRespondChanged = (eventId, updatedEvent) => {
    if (!updatedEvent) { reload(); return; }
    setEvents((prev) => {
      // Was this a "decline invitation" (no longer in participants and not pending)?
      const stillThere = updatedEvent.my_status !== "none";
      if (!stillThere) return prev.filter((e) => e.id !== eventId);
      return prev.map((ev) => ev.id === eventId ? { ...ev, ...updatedEvent } : ev);
    });
  };

  const isPast = (e) => {
    if (!e?.date) return false;
    const d = new Date(e.date);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  const filtered = useMemo(() => {
    let list = events;
    if (tab === "created")  list = list.filter((e) => e.creator_id === myId);
    if (tab === "pending")  list = list.filter((e) => e.my_status === "pending");
    if (tab === "past")     list = list.filter((e) => isPast(e));

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
    all:     events.length,
    created: events.filter((e) => e.creator_id === myId).length,
    pending: events.filter((e) => e.my_status === "pending").length,
    past:    events.filter((e) => isPast(e)).length,
  }), [events, myId]);

  // Show the response bar for: invitees (my_status==="pending") AND
  // accepted participants who aren't the creator.
  const showResponseBar = (e) =>
    e.creator_id !== myId &&
    (e.my_status === "pending" || e.my_status === "accepted");

  const statusPill = (e) => {
    if (e.creator_id === myId) return <Badge className="status-pill creator">Creator</Badge>;
    if (e.my_status === "pending")  return <Badge className="status-pill pending">Invitado</Badge>;
    if (e.my_status === "accepted") return <Badge className="status-pill accepted">Voy</Badge>;
    return <Badge bg="secondary">—</Badge>;
  };

  return (
    <div className="events-list-page">
      <style>{CSS}</style>

      <Container className="py-4">
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

        <Tabs activeKey={tab} onSelect={(k) => setTab(k)} className="mb-3" fill>
          <Tab eventKey="all"     title={<span>All     <Badge bg="secondary">{counts.all}</Badge></span>} />
          <Tab eventKey="created" title={<span>Created <Badge bg="secondary">{counts.created}</Badge></span>} />
          <Tab eventKey="pending" title={<span>Invitado <Badge bg="warning" text="dark">{counts.pending}</Badge></span>} />
          <Tab eventKey="past"    title={<span>Past    <Badge bg="secondary">{counts.past}</Badge></span>} />
        </Tabs>

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
                      <div className="d-flex align-items-center gap-1">
                        {/* 📍 Deep-link to the map at this event's location.
                            Disabled if the event has no coords (can't
                            possibly show on the map). */}
                        {e.latitude != null && e.longitude != null && (
                          <button
                            type="button"
                            className="btn btn-sm sq-go-to-map"
                            onClick={goToEventOnMap(navigate, e.id)}
                            title="Ver en el mapa"
                            style={{
                              padding: "2px 6px",
                              background: "rgba(99,102,241,0.15)",
                              border: "1px solid #6366f1",
                              borderRadius: 6,
                              color: "#a5b4fc",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <FiMapPin size={14} />
                          </button>
                        )}
                        {statusPill(e)}
                      </div>
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
                      {e.going_count > 0 && (
                        <span className="ms-2 small text-info">
                          ({e.going_count} voy)
                        </span>
                      )}
                    </div>

                    {showResponseBar(e) && (
                      <ResponseBar
                        eventId={e.id}
                        myStatus={e.my_status}
                        initialRsvp={e.my_rsvp}
                        onChanged={handleRespondChanged}
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