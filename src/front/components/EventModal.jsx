import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Button,
  Form,
  Row,
  Col,
  Tab,
  Tabs,
  Spinner,
  Alert,
  ListGroup,
  Badge,
  InputGroup,
} from "react-bootstrap";
import {
  FiCalendar,
  FiClock,
  FiMapPin,
  FiImage,
  FiSend,
  FiUserPlus,
  FiUsers,
  FiTrash2,
  FiMessageSquare,
  FiEdit2,
  FiSave,
} from "react-icons/fi";

// =============================================================
// INLINE API
// =============================================================
const API = import.meta.env.VITE_BACKEND_URL;

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const handle = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
  return data;
};

const apiGetEvent       = (id) => fetch(`${API}/api/events/${id}`, { headers: authHeaders() }).then(handle);
const apiCreateEvent    = (body) => fetch(`${API}/api/events`,        { method: "POST",   headers: authHeaders(), body: JSON.stringify(body) }).then(handle);
const apiUpdateEvent    = (id, body) => fetch(`${API}/api/events/${id}`,  { method: "PUT",  headers: authHeaders(), body: JSON.stringify(body) }).then(handle);
const apiInviteFriend   = (id, userId) => fetch(`${API}/api/events/${id}/invite`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ user_id: userId }) }).then(handle);
const apiRemoveMember   = (id, userId) => fetch(`${API}/api/events/${id}/participants/${userId}`, { method: "DELETE", headers: authHeaders() }).then(handle);
const apiGetMessages    = (id) => fetch(`${API}/api/events/${id}/chat/messages`, { headers: authHeaders() }).then(handle);
const apiPostMessage    = (id, text) => fetch(`${API}/api/events/${id}/chat/messages`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ text }) }).then(handle);
const apiListFriends    = () => fetch(`${API}/api/friends`, { headers: authHeaders() }).then(handle);

// =============================================================
// INLINE STYLES (dark mode, consistent with Friends / Profile)
// =============================================================
const EVENT_CSS = `
.event-modal .modal-content {
  background: #161922;
  color: #e9ecef;
  border: 1px solid #262a36;
  border-radius: 14px;
}
.event-modal .modal-header,
.event-modal .modal-footer { border-color: #262a36; }
.event-modal .form-control,
.event-modal .form-select,
.event-modal .form-control:focus {
  background-color: #0f111a !important;
  color: #e9ecef !important;
  border-color: #2a2f42 !important;
  box-shadow: none;
}
.event-modal .form-control::placeholder { color: #6c757d; }
.event-modal .form-label {
  color: #adb5bd;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.event-modal .nav-tabs { border-bottom: 1px solid #262a36; }
.event-modal .nav-tabs .nav-link {
  color: #adb5bd;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
}
.event-modal .nav-tabs .nav-link.active {
  color: #fff;
  background: transparent;
  border-bottom: 2px solid #6366f1;
}
.event-photo-preview {
  width: 100%; max-height: 220px; object-fit: cover;
  border-radius: 12px; border: 1px solid #262a36;
}
.event-photo-empty {
  width: 100%; height: 160px;
  border: 2px dashed #2a2f42;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: #6c757d;
}
.chat-box {
  background: #0f111a;
  border: 1px solid #262a36;
  border-radius: 12px;
  height: 280px;
  overflow-y: auto;
  padding: 0.75rem;
}
.chat-msg { margin-bottom: 0.6rem; }
.chat-msg .bubble {
  display: inline-block; padding: 0.4rem 0.7rem;
  border-radius: 10px; max-width: 80%;
  background: #1e2230; color: #e9ecef;
}
.chat-msg.mine { text-align: right; }
.chat-msg.mine .bubble {
  background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff;
}
.chat-msg .meta { font-size: 0.72rem; color: #6c757d; }
.event-participant-row {
  background: transparent !important;
  border-color: #262a36 !important;
  color: #e9ecef !important;
}
body.modal-open .bottom-navbar { display: none; }
`;

// =============================================================
// HELPERS
// =============================================================
const initials = (email = "") =>
  email.split("@")[0].split(/[._-]/).map((s) => s.charAt(0).toUpperCase()).join("").slice(0, 2) || "?";

const avatarStyle = (seed) => ({
  width: 36, height: 36, borderRadius: "50%",
  background: `linear-gradient(135deg, hsl(${seed % 360},70%,40%), hsl(${(seed * 7) % 360},70%,25%))`,
  color: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontWeight: 700, flexShrink: 0,
});

// convert a File to base64 data URL
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// reverse geocode lat/lng via Nominatim (no API key)
const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`,
      { headers: { "Accept": "application/json" } }
    );
    const d = await res.json();
    return d.display_name || "";
  } catch {
    return "";
  }
};

// =============================================================
// MAIN
// =============================================================
//   props:
//     show              -> boolean
//     onHide            -> close handler
//     eventId           -> when provided: view/edit mode. when null: create mode.
//     prefillCoords     -> { latitude, longitude } when opening from a map click
//     currentUser       -> { id, email } of the logged user (from localStorage)
//     onSaved           -> callback after create/update (refresh map etc.)
//     onDeleted         -> not used yet
export const EventModal = ({
  show,
  onHide,
  eventId = null,
  prefillCoords = null,
  currentUser = null,
  onSaved = () => {},
}) => {
  const isEditMode = !!eventId;
  const [tab, setTab] = useState("details");

  // --- form state ---
  const [form, setForm] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    details: "",
    image: "",
    latitude: null,
    longitude: null,
  });

  const [eventData, setEventData] = useState(null); // hydrated server response
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [toast, setToast]     = useState(null);

  // --- friends + invitations ---
  const [friends, setFriends] = useState([]);
  const [invitedIds, setInvitedIds] = useState([]); // create mode only

  // --- chat ---
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const chatBoxRef = useRef(null);

  const fileInputRef = useRef(null);

  // =====================================================
  // LOAD on open
  // =====================================================
  useEffect(() => {
    if (!show) return;

    // reset
    setTab("details");
    setError(null);
    setToast(null);
    setInvitedIds([]);
    setMessages([]);

    // load friends list (used by both create and edit)
    apiListFriends().then(setFriends).catch(() => setFriends([]));

    if (isEditMode) {
      hydrate();
    } else {
      // create mode — reset form, apply prefill if any
      setForm({
        title:     "",
        date:      "",
        time:      "",
        location:  "",
        details:   "",
        image:     "",
        latitude:  prefillCoords?.latitude ?? null,
        longitude: prefillCoords?.longitude ?? null,
      });
      setEventData(null);

      if (prefillCoords?.latitude && prefillCoords?.longitude) {
        reverseGeocode(prefillCoords.latitude, prefillCoords.longitude).then((addr) => {
          if (addr) setForm((f) => ({ ...f, location: addr }));
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, eventId]);

  const hydrate = async () => {
    setLoading(true);
    try {
      const data = await apiGetEvent(eventId);
      setEventData(data);
      setForm({
        title:     data.title || "",
        date:      data.date  || "",
        time:      data.time  || "",
        location:  data.location  || "",
        details:   data.details   || "",
        image:     data.image     || "",
        latitude:  data.latitude,
        longitude: data.longitude,
      });
      // load messages
      const m = await apiGetMessages(eventId);
      setMessages(m.messages || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "chat" && chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [tab, messages]);

  // poll chat every 4s while the chat tab is open
  useEffect(() => {
    if (!isEditMode || tab !== "chat") return;
    const t = setInterval(async () => {
      try {
        const m = await apiGetMessages(eventId);
        setMessages(m.messages || []);
      } catch (_) {}
    }, 4000);
    return () => clearInterval(t);
  }, [tab, isEditMode, eventId]);

  // =====================================================
  // HANDLERS
  // =====================================================
  const showToast = (text, variant = "success") => {
    setToast({ text, variant });
    setTimeout(() => setToast(null), 2200);
  };

  const handleField = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      showToast("Image too large (max 1.5 MB)", "danger");
      return;
    }
    try {
      const b64 = await fileToBase64(file);
      setForm((f) => ({ ...f, image: b64 }));
      if (isEditMode) {
        // persist immediately
        const data = await apiUpdateEvent(eventId, { image: b64 });
        setEventData(data.event);
        showToast("Photo updated");
        onSaved(data.event);
      }
    } catch {
      showToast("Failed to read file", "danger");
    }
  };

  const toggleInvite = (id) => {
    setInvitedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!form.date || !form.time || !form.location) {
      showToast("date, time and location are required", "danger");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEditMode) {
        const data = await apiUpdateEvent(eventId, {
          title:     form.title,
          date:      form.date,
          time:      form.time,
          location:  form.location,
          details:   form.details,
          latitude:  form.latitude,
          longitude: form.longitude,
        });
        setEventData(data.event);
        showToast("Event updated");
        onSaved(data.event);
      } else {
        const data = await apiCreateEvent({
          title:     form.title,
          date:      form.date,
          time:      form.time,
          location:  form.location,
          details:   form.details,
          image:     form.image || null,
          latitude:  form.latitude,
          longitude: form.longitude,
          invitedFriends: invitedIds,
        });
        showToast("Event created");
        onSaved(data.event);
        onHide();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInviteNow = async (friendUserId) => {
    try {
      const data = await apiInviteFriend(eventId, friendUserId);
      setEventData(data.event);
      showToast("Friend invited");
      onSaved(data.event);
    } catch (e) {
      showToast(e.message, "danger");
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      const data = await apiRemoveMember(eventId, userId);
      setEventData(data.event);
      showToast("Participant removed");
      onSaved(data.event);
    } catch (e) {
      showToast(e.message, "danger");
    }
  };

  const handleSendMessage = async () => {
    const text = chatText.trim();
    if (!text) return;
    try {
      await apiPostMessage(eventId, text);
      setChatText("");
      const m = await apiGetMessages(eventId);
      setMessages(m.messages || []);
    } catch (e) {
      showToast(e.message, "danger");
    }
  };

  // =====================================================
  // DERIVED
  // =====================================================
  const isCreator = eventData?.is_creator ?? !isEditMode;
  const participants = eventData?.participants || [];
  const participantIds = new Set(participants.map((p) => p.id));

  // friends I can still invite (not already in participants)
  const friendsAvailable = friends
    .map((f) => f.friend)
    .filter((u) => u && !participantIds.has(u.id));

  const title = isEditMode
    ? (eventData?.title || "Event")
    : "Create event";

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      size="lg"
      dialogClassName="event-modal"
    >
      <style>{EVENT_CSS}</style>

      <Modal.Header closeButton closeVariant="white">
        <Modal.Title className="d-flex align-items-center gap-2">
          {isEditMode ? <FiEdit2 /> : <FiCalendar />} {title}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {loading && (
          <div className="text-center py-4">
            <Spinner animation="border" />
          </div>
        )}

        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>
        )}
        {toast && <Alert variant={toast.variant}>{toast.text}</Alert>}

        {!loading && (
          <Tabs activeKey={tab} onSelect={(k) => setTab(k)} className="mb-3" fill>

            {/* ─────────── DETAILS ─────────── */}
            <Tab eventKey="details" title={<span><FiCalendar className="me-1" /> Details</span>}>
              <Row className="g-3 mt-1">
                <Col xs={12}>
                  <Form.Label>Cover photo</Form.Label>
                  {form.image ? (
                    <img src={form.image} alt="event" className="event-photo-preview mb-2" />
                  ) : (
                    <div className="event-photo-empty mb-2"><FiImage size={28} /></div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImage}
                    style={{ display: "none" }}
                  />
                  {(isCreator || !isEditMode) && (
                    <Button
                      variant="outline-light"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FiImage className="me-1" /> {form.image ? "Change photo" : "Upload photo"}
                    </Button>
                  )}
                </Col>

                <Col xs={12}>
                  <Form.Label>Title</Form.Label>
                  <Form.Control
                    name="title"
                    value={form.title}
                    onChange={handleField}
                    placeholder="e.g. Saturday padel"
                    disabled={isEditMode && !isCreator}
                  />
                </Col>

                <Col md={6}>
                  <Form.Label><FiCalendar className="me-1" /> Date</Form.Label>
                  <Form.Control
                    type="date"
                    name="date"
                    value={form.date}
                    onChange={handleField}
                    disabled={isEditMode && !isCreator}
                  />
                </Col>
                <Col md={6}>
                  <Form.Label><FiClock className="me-1" /> Time</Form.Label>
                  <Form.Control
                    type="time"
                    name="time"
                    value={form.time}
                    onChange={handleField}
                    disabled={isEditMode && !isCreator}
                  />
                </Col>

                <Col xs={12}>
                  <Form.Label><FiMapPin className="me-1" /> Location</Form.Label>
                  <Form.Control
                    name="location"
                    value={form.location}
                    onChange={handleField}
                    placeholder="Address"
                    disabled={isEditMode && !isCreator}
                  />
                  {form.latitude != null && form.longitude != null && (
                    <small className="text-secondary">
                      {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}
                    </small>
                  )}
                </Col>

                <Col xs={12}>
                  <Form.Label>Details</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    name="details"
                    value={form.details}
                    onChange={handleField}
                    placeholder="Notes for participants..."
                    disabled={isEditMode && !isCreator}
                  />
                </Col>
              </Row>
            </Tab>

            {/* ─────────── PARTICIPANTS ─────────── */}
            <Tab
              eventKey="participants"
              title={
                <span>
                  <FiUsers className="me-1" /> Participants{" "}
                  <Badge bg="secondary">
                    {isEditMode ? participants.length : invitedIds.length + 1}
                  </Badge>
                </span>
              }
            >
              {isEditMode ? (
                <>
                  <div className="small text-secondary text-uppercase fw-semibold mb-2">
                    Currently in
                  </div>
                  <ListGroup className="mb-3">
                    {participants.map((p) => (
                      <ListGroup.Item
                        key={p.id}
                        className="event-participant-row d-flex align-items-center justify-content-between"
                      >
                        <div className="d-flex align-items-center gap-2">
                          <div style={avatarStyle(p.id)}>{initials(p.email)}</div>
                          <span>{p.email}</span>
                          {p.id === eventData?.creator_id && (
                            <Badge bg="info" className="ms-1">Creator</Badge>
                          )}
                        </div>
                        {isCreator && p.id !== eventData?.creator_id && (
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleRemoveMember(p.id)}
                          >
                            <FiTrash2 />
                          </Button>
                        )}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>

                  {isCreator && (
                    <>
                      <div className="small text-secondary text-uppercase fw-semibold mb-2">
                        Invite a friend
                      </div>
                      {friendsAvailable.length === 0 ? (
                        <div className="small text-secondary">
                          No friends left to invite.
                        </div>
                      ) : (
                        <ListGroup>
                          {friendsAvailable.map((u) => (
                            <ListGroup.Item
                              key={u.id}
                              className="event-participant-row d-flex align-items-center justify-content-between"
                            >
                              <div className="d-flex align-items-center gap-2">
                                <div style={avatarStyle(u.id)}>{initials(u.email)}</div>
                                <span>{u.email}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleInviteNow(u.id)}
                              >
                                <FiUserPlus className="me-1" /> Invite
                              </Button>
                            </ListGroup.Item>
                          ))}
                        </ListGroup>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="small text-secondary text-uppercase fw-semibold mb-2">
                    Invite friends (you can add more later)
                  </div>
                  {friends.length === 0 ? (
                    <div className="small text-secondary">
                      You have no friends yet. Add some on the Friends page.
                    </div>
                  ) : (
                    <ListGroup>
                      {friends.map((f) => {
                        const u = f.friend;
                        if (!u) return null;
                        const selected = invitedIds.includes(u.id);
                        return (
                          <ListGroup.Item
                            key={u.id}
                            className="event-participant-row d-flex align-items-center justify-content-between"
                          >
                            <div className="d-flex align-items-center gap-2">
                              <div style={avatarStyle(u.id)}>{initials(u.email)}</div>
                              <span>{u.email}</span>
                            </div>
                            <Form.Check
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleInvite(u.id)}
                            />
                          </ListGroup.Item>
                        );
                      })}
                    </ListGroup>
                  )}
                </>
              )}
            </Tab>

            {/* ─────────── CHAT ─────────── */}
            {isEditMode && (
              <Tab eventKey="chat" title={<span><FiMessageSquare className="me-1" /> Chat</span>}>
                <div className="chat-box" ref={chatBoxRef}>
                  {messages.length === 0 ? (
                    <div className="text-secondary small text-center mt-4">
                      No messages yet. Be the first.
                    </div>
                  ) : (
                    messages.map((m) => {
                      const mine = currentUser && m.sender_id === currentUser.id;
                      return (
                        <div key={m.id} className={`chat-msg ${mine ? "mine" : ""}`}>
                          {!mine && (
                            <div className="meta">{m.sender_email}</div>
                          )}
                          <div className="bubble">{m.text}</div>
                          <div className="meta">
                            {new Date(m.created_at).toLocaleString()}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <InputGroup className="mt-3">
                  <Form.Control
                    placeholder="Type a message..."
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage(); }}
                  />
                  <Button variant="primary" onClick={handleSendMessage}>
                    <FiSend />
                  </Button>
                </InputGroup>
              </Tab>
            )}
          </Tabs>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-light" onClick={onHide}>Close</Button>
        {(!isEditMode || isCreator) && (
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? <Spinner animation="border" size="sm" />
              : <><FiSave className="me-1" /> {isEditMode ? "Save changes" : "Create"}</>
            }
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default EventModal;
