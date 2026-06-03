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
  FiMic,
  FiSquare,
  FiCheck,
  FiX,
} from "react-icons/fi";

// =============================================================
// INLINE API
// =============================================================
const API = import.meta.env.VITE_BACKEND_URL;

// Same window the backend enforces (15 min). Keeping it identical
// avoids showing an Edit button that would 409 server-side.
const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const handle = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
  return data;
};

const apiGetEvent       = async (id) => await fetch(`${API}/api/events/${id}`, { headers: authHeaders() }).then(handle);
const apiCreateEvent    = (body) => fetch(`${API}/api/events`,        { method: "POST",   headers: authHeaders(), body: JSON.stringify(body) }).then(handle);
const apiUpdateEvent    = (id, body) => fetch(`${API}/api/events/${id}`,  { method: "PUT",  headers: authHeaders(), body: JSON.stringify(body) }).then(handle);
const apiDeleteEvent    = (id) => fetch(`${API}/api/events/${id}`,  { method: "DELETE", headers: authHeaders() }).then(handle);
const apiInviteFriend   = (id, userId) => fetch(`${API}/api/events/${id}/invite`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ user_id: userId }) }).then(handle);
const apiRemoveMember   = (id, userId) => fetch(`${API}/api/events/${id}/participants/${userId}`, { method: "DELETE", headers: authHeaders() }).then(handle);

// Chat — legacy event-scoped endpoints (text + media supported server-side)
const apiGetMessages    = (id) => fetch(`${API}/api/events/${id}/chat/messages`, { headers: authHeaders() }).then(handle);
const apiPostMessage    = (id, body) => fetch(`${API}/api/events/${id}/chat/messages`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }).then(handle);

// Chat — room-scoped endpoints (needed for edit + mark-read)
const apiEditMessage    = (roomId, msgId, text) =>
  fetch(`${API}/api/chat/rooms/${roomId}/messages/${msgId}`, {
    method: "PUT", headers: authHeaders(), body: JSON.stringify({ text }),
  }).then(handle);
const apiMarkRoomRead   = (roomId) =>
  fetch(`${API}/api/chat/rooms/${roomId}/read`, { method: "PUT", headers: authHeaders() }).then(handle);

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

/* Chat box */
.chat-box {
  background: #0f111a;
  border: 1px solid #262a36;
  border-radius: 12px;
  height: 280px;
  overflow-y: auto;
  padding: 0.75rem;
}
.chat-msg { margin-bottom: 0.6rem; position: relative; }
.chat-msg .bubble {
  display: inline-block; padding: 0.4rem 0.7rem;
  border-radius: 10px; max-width: 80%;
  background: #1e2230; color: #e9ecef;
  text-align: left;
}
.chat-msg.mine { text-align: right; }
.chat-msg.mine .bubble {
  background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff;
}
.chat-msg .meta { font-size: 0.72rem; color: #6c757d; }
.chat-msg .meta-edited {
  font-size: 0.68rem; color: #6c757d; font-style: italic;
  margin-left: 0.3rem;
}
.chat-msg .chat-img {
  display: block; max-width: 220px; max-height: 220px;
  border-radius: 8px; object-fit: cover;
}
.chat-msg .chat-audio { display: block; max-width: 240px; }

/* Edit-in-place */
.chat-edit-btn {
  background: transparent !important; border: none !important;
  color: #adb5bd !important;
  font-size: 0.7rem !important;
  padding: 0 0.25rem !important;
  margin-left: 0.25rem;
  vertical-align: middle;
}
.chat-edit-btn:hover { color: #fff !important; }
.chat-edit-form {
  display: inline-flex; gap: 0.3rem; align-items: center;
  max-width: 90%;
}
.chat-edit-input {
  background: #0f111a !important; color: #e9ecef !important;
  border: 1px solid #6366f1 !important;
  font-size: 0.85rem !important;
  padding: 0.3rem 0.5rem !important;
  min-width: 180px;
}
.chat-edit-input:focus {
  box-shadow: 0 0 0 0.15rem rgba(99,102,241,0.25) !important;
}
.chat-edit-save {
  background: #4f46e5 !important; border: none !important; color: #fff !important;
  font-size: 0.78rem !important; padding: 0.25rem 0.45rem !important;
}
.chat-edit-cancel {
  background: #1e2230 !important; border: 1px solid #262a36 !important; color: #adb5bd !important;
  font-size: 0.78rem !important; padding: 0.25rem 0.45rem !important;
}

/* Media buttons */
.chat-media-btn {
  background: #1e2230 !important; color: #adb5bd !important;
  border: 1px solid #262a36 !important;
}
.chat-media-btn:hover { background: #262a36 !important; color: #fff !important; }
.chat-media-btn.recording {
  background: #ef4444 !important; color: #fff !important;
  border-color: #ef4444 !important;
  animation: sq-pulse 1s ease-in-out infinite;
}
@keyframes sq-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
  50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
}

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

// convert a File / Blob to base64 data URL
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Can the current user edit this chat message right now?
// Sender + has text + within the 15-min window.
const canEditChatMessage = (m, currentUserId) => {
  if (!currentUserId) return false;
  if (m.sender_id !== currentUserId) return false;
  if (!m.text) return false;
  const t = new Date(m.created_at).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < CHAT_EDIT_WINDOW_MS;
};

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
  onDeleted = () => {},
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

  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState(null);
  const [toast, setToast]     = useState(null);

  // --- friends + invitations ---
  const [friends, setFriends] = useState([]);
  const [invitedIds, setInvitedIds] = useState([]);

  // --- chat ---
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const chatBoxRef = useRef(null);

  // chat: edit-in-place
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editText, setEditText] = useState("");

  // chat: image input
  const chatImageInputRef = useRef(null);

  // chat: audio recorder
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const fileInputRef = useRef(null);

  // =====================================================
  // LOAD on open
  // =====================================================
  useEffect(() => {
    if (!show) return;

    setTab("details");
    setError(null);
    setToast(null);
    setInvitedIds([]);
    setMessages([]);
    cancelEdit();
    stopRecording(true);

    apiListFriends().then(setFriends).catch(() => setFriends([]));

    if (isEditMode) {
      hydrate();
    } else {
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

  // Mark the room as read when the chat tab is opened, so the navbar
  // unread badge drops immediately.
  useEffect(() => {
    if (tab !== "chat") return;
    const rid = eventData?.chat_room_id;
    if (!rid) return;
    apiMarkRoomRead(rid).catch(() => {});
  }, [tab, eventData?.chat_room_id]);

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

  const [pendingInviteIds, setPendingInviteIds] = useState([]);

  const handleInviteNow = async (friendUserId) => {
    setPendingInviteIds((prev) => [...prev, friendUserId]);
    try {
      const data = await apiInviteFriend(eventId, friendUserId);
      setEventData(data.event);
      showToast("Friend invited");
      onSaved(data.event);
    } catch (e) {
      // if already a participant the backend returns 409 — keep pending state
      // for any other error, remove from pending so user can retry
      if (!e.message?.toLowerCase().includes("already")) {
        setPendingInviteIds((prev) => prev.filter((id) => id !== friendUserId));
      }
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

  const handleDelete = async () => {
    if (!isEditMode) return;
    const ok = window.confirm(
      "Delete this event? This will also remove its chat and all participants. This cannot be undone."
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await apiDeleteEvent(eventId);
      onDeleted(eventId);
      onHide();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // ----- chat: send text -----
  const handleSendMessage = async () => {
    const text = chatText.trim();
    if (!text) return;
    try {
      await apiPostMessage(eventId, { text });
      setChatText("");
      const m = await apiGetMessages(eventId);
      setMessages(m.messages || []);
    } catch (e) {
      showToast(e.message, "danger");
    }
  };

  // ----- chat: send image -----
  const handlePickChatImage = () => {
    if (chatImageInputRef.current) chatImageInputRef.current.click();
  };

  const handleChatImageChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      showToast("Image too large (max 1.5 MB)", "danger");
      return;
    }
    try {
      const dataUrl = await fileToBase64(file);
      await apiPostMessage(eventId, {
        media_url: dataUrl,
        media_type: "image",
      });
      const m = await apiGetMessages(eventId);
      setMessages(m.messages || []);
    } catch (err) {
      showToast(err.message || "Failed to send image", "danger");
    }
  };

  // ----- chat: record + send audio -----
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("Audio recording not supported in this browser", "danger");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioChunksRef.current.length === 0) return;
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        try {
          const dataUrl = await fileToBase64(blob);
          await apiPostMessage(eventId, {
            media_url: dataUrl,
            media_type: "audio",
          });
          const m = await apiGetMessages(eventId);
          setMessages(m.messages || []);
        } catch (err) {
          showToast(err.message || "Failed to send audio", "danger");
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      showToast("Microphone access denied", "danger");
    }
  };

  const stopRecording = (cancel = false) => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (cancel) audioChunksRef.current = [];
    if (rec.state !== "inactive") {
      try { rec.stop(); } catch (_) { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording(false);
    else startRecording();
  };

  // ----- chat: edit -----
  const beginEdit = (m) => {
    setEditingMsgId(m.id);
    setEditText(m.text || "");
  };

  const cancelEdit = () => {
    setEditingMsgId(null);
    setEditText("");
  };

  const saveEdit = async () => {
    if (!editingMsgId) return;
    const rid = eventData?.chat_room_id;
    if (!rid) {
      showToast("Chat room unavailable", "danger");
      return;
    }
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      await apiEditMessage(rid, editingMsgId, trimmed);
      cancelEdit();
      const m = await apiGetMessages(eventId);
      setMessages(m.messages || []);
    } catch (err) {
      showToast(err.message || "Failed to edit message", "danger");
      cancelEdit();
    }
  };

  // =====================================================
  // DERIVED
  // =====================================================
  const isCreator = eventData?.is_creator ?? !isEditMode;
  const participants = eventData?.participants || [];
  const participantIds = new Set(participants.map((p) => p.id));

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
                              {pendingInviteIds.includes(u.id) ? (
                                <Button size="sm" variant="secondary" disabled>
                                  <FiClock className="me-1" /> Pending
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleInviteNow(u.id)}
                                >
                                  <FiUserPlus className="me-1" /> Invite
                                </Button>
                              )}
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
                      const isEditing = editingMsgId === m.id;
                      const hasImage = m.media_type === "image" && m.media_url;
                      const hasAudio = m.media_type === "audio" && m.media_url;
                      const showEditBtn = canEditChatMessage(m, currentUser?.id) && !isEditing;
                      return (
                        <div key={m.id} className={`chat-msg ${mine ? "mine" : ""}`}>
                          {!mine && (
                            <div className="meta">{m.sender_email}</div>
                          )}

                          {isEditing ? (
                            <div className="chat-edit-form">
                              <Form.Control
                                className="chat-edit-input"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit();
                                  if (e.key === "Escape") cancelEdit();
                                }}
                                autoFocus
                              />
                              <Button
                                className="chat-edit-save"
                                onClick={saveEdit}
                                disabled={!editText.trim()}
                                title="Guardar"
                              >
                                <FiCheck />
                              </Button>
                              <Button
                                className="chat-edit-cancel"
                                onClick={cancelEdit}
                                title="Cancelar"
                              >
                                <FiX />
                              </Button>
                            </div>
                          ) : (
                            <div className="bubble">
                              {hasImage && (
                                <img
                                  src={m.media_url}
                                  alt="foto"
                                  className="chat-img"
                                />
                              )}
                              {hasAudio && (
                                <audio
                                  controls
                                  src={m.media_url}
                                  className="chat-audio"
                                />
                              )}
                              {m.text && <div>{m.text}</div>}
                            </div>
                          )}

                          <div className="meta">
                            {new Date(m.created_at).toLocaleString()}
                            {m.edited_at && (
                              <span className="meta-edited">(editado)</span>
                            )}
                            {showEditBtn && (
                              <Button
                                className="chat-edit-btn"
                                onClick={() => beginEdit(m)}
                                title="Editar (15 min)"
                              >
                                <FiEdit2 />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <InputGroup className="mt-3">
                  <Button
                    className="chat-media-btn"
                    onClick={handlePickChatImage}
                    title="Enviar foto"
                    disabled={isRecording || !!editingMsgId}
                  >
                    <FiImage />
                  </Button>
                  <Button
                    className={`chat-media-btn ${isRecording ? "recording" : ""}`}
                    onClick={toggleRecording}
                    title={isRecording ? "Detener y enviar audio" : "Grabar audio"}
                    disabled={!!editingMsgId}
                  >
                    {isRecording ? <FiSquare /> : <FiMic />}
                  </Button>
                  <Form.Control
                    placeholder={
                      isRecording
                        ? "Grabando audio..."
                        : editingMsgId
                        ? "Editando un mensaje..."
                        : "Type a message..."
                    }
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage(); }}
                    disabled={isRecording || !!editingMsgId}
                  />
                  <Button
                    variant="primary"
                    onClick={handleSendMessage}
                    disabled={isRecording || !!editingMsgId || !chatText.trim()}
                  >
                    <FiSend />
                  </Button>
                </InputGroup>

                <input
                  ref={chatImageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleChatImageChange}
                />
              </Tab>
            )}
          </Tabs>
        )}
      </Modal.Body>

      <Modal.Footer>
        {isEditMode && isCreator && (
          <Button
            variant="outline-danger"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="me-auto"
          >
            {deleting
              ? <Spinner animation="border" size="sm" />
              : <><FiTrash2 className="me-1" /> Delete event</>
            }
          </Button>
        )}
        <Button variant="outline-light" onClick={onHide}>Close</Button>
        {(!isEditMode || isCreator) && (
          <Button onClick={handleSave} disabled={saving || deleting}>
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
