import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  FiCheckCircle,
  FiHelpCircle,
  FiXCircle,
  FiLogOut,
  FiUserCheck,
  FiGlobe,
  FiLock,
  FiMaximize2,
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

// Multi-invite (back-compat: array of user ids in one call)
const apiInviteBatch    = (id, userIds) =>
  fetch(`${API}/api/events/${id}/invite`, {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ user_ids: userIds }),
  }).then(handle);

const apiRemoveMember   = (id, userId) => fetch(`${API}/api/events/${id}/participants/${userId}`, { method: "DELETE", headers: authHeaders() }).then(handle);

// Unified response (going / maybe / not_going) — works for both invitees
// (joins them or declines) and participants (just updates rsvp).
const apiRespond        = (id, response) =>
  fetch(`${API}/api/events/${id}/respond`, {
    method: "PUT", headers: authHeaders(),
    body: JSON.stringify({ response }),
  }).then(handle);

// Leave event (non-creator participants)
const apiLeaveEvent     = (id) =>
  fetch(`${API}/api/events/${id}/leave`, {
    method: "DELETE", headers: authHeaders(),
  }).then(handle);

// Invite suggestions (a participant proposes; the creator approves)
const apiSuggestInvite      = (id, userIds) =>
  fetch(`${API}/api/events/${id}/suggest-invite`, {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ user_ids: userIds }),
  }).then(handle);
const apiListSuggestions    = (id) =>
  fetch(`${API}/api/events/${id}/suggestions`, { headers: authHeaders() }).then(handle);
const apiApproveSuggestion  = (id, sid) =>
  fetch(`${API}/api/events/${id}/suggestions/${sid}/approve`, {
    method: "PUT", headers: authHeaders(),
  }).then(handle);
const apiRefuseSuggestion   = (id, sid) =>
  fetch(`${API}/api/events/${id}/suggestions/${sid}/refuse`, {
    method: "PUT", headers: authHeaders(),
  }).then(handle);
const apiApproveAllSuggestions = (id) =>
  fetch(`${API}/api/events/${id}/suggestions/approve-all`, {
    method: "PUT", headers: authHeaders(),
  }).then(handle);
const apiRefuseAllSuggestions  = (id) =>
  fetch(`${API}/api/events/${id}/suggestions/refuse-all`, {
    method: "PUT", headers: authHeaders(),
  }).then(handle);

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

/* ── RESPONSE BAR (Going / Maybe / Not going) ── */
.sq-response-bar {
  display: flex; gap: 6px; padding: 10px;
  background: #0f111a; border: 1px solid #262a36; border-radius: 12px;
  margin-bottom: 1rem;
}
.sq-response-btn {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 7px 8px;
  border-radius: 8px;
  border: 1px solid #262a36;
  background: #161922;
  color: #adb5bd;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.sq-response-btn:hover { background: #1e2230; color: #fff; }
.sq-response-btn.active-going     { background: rgba(34,211,238,0.18); border-color: #22d3ee; color: #22d3ee; }
.sq-response-btn.active-maybe     { background: rgba(250,204,21,0.18); border-color: #facc15; color: #facc15; }
.sq-response-btn.active-not_going { background: rgba(244,63,94,0.18);  border-color: #f43f5e; color: #f43f5e; }
.sq-response-btn:disabled { opacity: 0.5; pointer-events: none; }

/* RSVP pill next to participant name */
.sq-rsvp-pill {
  font-size: 0.6rem !important;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px !important;
  border-radius: 999px !important;
}
.sq-rsvp-pill.going     { background: rgba(34,211,238,0.2)  !important; color: #22d3ee !important; }
.sq-rsvp-pill.maybe     { background: rgba(250,204,21,0.2)  !important; color: #facc15 !important; }
.sq-rsvp-pill.not_going { background: rgba(244,63,94,0.2)   !important; color: #f43f5e !important; }
.sq-rsvp-pill.none      { background: #1e2230 !important; color: #6c757d !important; }

/* Creator avatar in header */
.sq-creator-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #262a36;
  margin-bottom: 0.75rem;
}
.sq-creator-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  object-fit: cover; border: 2px solid #6366f1;
  background: #0f111a;
}

/* Suggestion row (creator's "Suggestions" tab) */
.sq-suggestion-row {
  display: flex; align-items: center; gap: 0.6rem;
  background: #0f111a; border: 1px solid #262a36; border-radius: 10px;
  padding: 0.6rem 0.75rem; margin-bottom: 0.5rem;
}
.sq-suggestion-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  object-fit: cover; flex-shrink: 0;
  border: 1px solid #262a36; background: #1e2230;
}
.sq-suggestion-body { flex: 1; min-width: 0; }
.sq-suggestion-from {
  font-size: 0.72rem; color: #6c757d; margin-top: 2px;
}

/* Friend checkbox list (multi-invite / multi-suggest) */
.sq-friend-checkbox-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.4rem 0.6rem; border-radius: 8px;
  cursor: pointer; transition: background 0.12s;
}
.sq-friend-checkbox-row:hover { background: #1e2230; }
.sq-friend-checkbox-row.selected { background: rgba(99,102,241,0.12); }

/* Visibility (public / private) toggle */
.visibility-toggle { display: flex; gap: 8px; }
.visibility-toggle .vis-option {
  flex: 1;
  display: flex; align-items: center;
  gap: 4px;
  text-align: left;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  border: 1px solid #262a36;
  background: #0f111a;
  color: #adb5bd;
  cursor: pointer;
  transition: all 0.12s ease;
}
.visibility-toggle .vis-option:hover:not(:disabled) { border-color: #3a3f55; color: #e9ecef; }
.visibility-toggle .vis-option.active {
  border-color: #6366f1;
  background: rgba(99,102,241,0.12);
  color: #fff;
}
.visibility-toggle .vis-option:disabled { opacity: 0.5; cursor: not-allowed; }
.visibility-toggle .vis-option span { display: flex; flex-direction: column; line-height: 1.25; }
.visibility-toggle .vis-option strong { font-size: 0.9rem; }
.visibility-toggle .vis-option small { font-size: 0.7rem; color: #6c757d; }
.visibility-toggle .vis-option.active small { color: #adb5bd; }
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
  const navigate = useNavigate();

  // --- form state ---
  const [form, setForm] = useState({
    title: "",
    date: "",
    time: "",
    location: "",
    details: "",
    image: "",
    is_public: false,
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
        is_public: false,
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
        is_public: !!data.is_public,
        latitude:  data.latitude,
        longitude: data.longitude,
      });
      const m = await apiGetMessages(eventId);
      setMessages(m.messages || []);
      // Load pending suggestions if I'm the creator (silently no-op otherwise).
      if (data.is_creator) {
        try {
          const s = await apiListSuggestions(eventId);
          setSuggestions(Array.isArray(s) ? s : []);
        } catch (_) { /* ignore */ }
      } else {
        setSuggestions([]);
      }
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
          is_public: form.is_public,
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
          is_public: form.is_public,
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

  // Multi-select state for the "Invite" list (creator) and the "Suggest"
  // list (non-creator participant). Each is a Set of user ids.
  const [selectedToInvite, setSelectedToInvite] = useState(() => new Set());
  const [selectedToSuggest, setSelectedToSuggest] = useState(() => new Set());

  // Suggestions tab state (creator only)
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);

  // Response (going/maybe/not_going) saving state
  const [respondBusy, setRespondBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Batch invite — sends one request with the full list.
  const handleInviteBatch = async () => {
    const ids = Array.from(selectedToInvite);
    if (!ids.length) return;
    setPendingInviteIds((prev) => [...prev, ...ids]);
    try {
      const data = await apiInviteBatch(eventId, ids);
      setEventData(data.event);
      setSelectedToInvite(new Set());
      const sent = (data.invitations || []).length;
      const skipped = (data.skipped || []).length;
      showToast(
        skipped > 0 ? `${sent} invitation(s) sent, ${skipped} skipped` : `${sent} invitation(s) sent`
      );
      onSaved(data.event);
    } catch (e) {
      setPendingInviteIds((prev) => prev.filter((x) => !ids.includes(x)));
      showToast(e.message, "danger");
    }
  };

  // Batch suggest (non-creator participant) — generates one notification
  // per suggestion to the creator.
  const handleSuggestBatch = async () => {
    const ids = Array.from(selectedToSuggest);
    if (!ids.length) return;
    try {
      const data = await apiSuggestInvite(eventId, ids);
      setSelectedToSuggest(new Set());
      const sent = (data.suggestions || []).length;
      const skipped = (data.skipped || []).length;
      showToast(
        skipped > 0 ? `${sent} suggestion(s) sent, ${skipped} skipped` : `${sent} suggestion(s) sent`
      );
    } catch (e) {
      showToast(e.message, "danger");
    }
  };

  // Creator: pull pending suggestions and refresh after each action.
  const reloadSuggestions = async () => {
    if (!eventId) return;
    setSuggestionsLoading(true);
    try {
      const data = await apiListSuggestions(eventId);
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (e) {
      // 403 if not creator — fine, just empty list
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleApproveSuggestion = async (sid) => {
    if (suggestionsBusy) return;
    setSuggestionsBusy(true);
    try {
      const data = await apiApproveSuggestion(eventId, sid);
      setEventData(data.event);
      await reloadSuggestions();
      showToast("Suggestion approved — invitation sent");
      onSaved(data.event);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setSuggestionsBusy(false);
    }
  };

  const handleRefuseSuggestion = async (sid) => {
    if (suggestionsBusy) return;
    setSuggestionsBusy(true);
    try {
      const data = await apiRefuseSuggestion(eventId, sid);
      setEventData(data.event);
      await reloadSuggestions();
      showToast("Sugerencia rechazada");
      onSaved(data.event);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setSuggestionsBusy(false);
    }
  };

  const handleApproveAllSuggestions = async () => {
    if (suggestionsBusy) return;
    setSuggestionsBusy(true);
    try {
      const data = await apiApproveAllSuggestions(eventId);
      setEventData(data.event);
      await reloadSuggestions();
      const n = (data.invitations || []).length;
      showToast(`${n} suggestion(s) approved`);
      onSaved(data.event);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setSuggestionsBusy(false);
    }
  };

  const handleRefuseAllSuggestions = async () => {
    if (suggestionsBusy) return;
    setSuggestionsBusy(true);
    try {
      const data = await apiRefuseAllSuggestions(eventId);
      setEventData(data.event);
      await reloadSuggestions();
      showToast("Sugerencias rechazadas");
      onSaved(data.event);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setSuggestionsBusy(false);
    }
  };

  // Unified response (going/maybe/not_going). Works for invitees and participants.
  const handleRespond = async (response) => {
    if (respondBusy || !eventId) return;
    setRespondBusy(true);
    try {
      const data = await apiRespond(eventId, response);
      setEventData(data.event);
      showToast(
        response === "going" ? "Going" :
        response === "maybe" ? "Maybe" :
        "Not going"
      );
      onSaved(data.event);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setRespondBusy(false);
    }
  };

  // Leave event entirely (non-creator only)
  const handleLeave = async () => {
    if (leaving || !eventId) return;
    if (!window.confirm("Leave this event? You will lose access to the chat.")) return;
    setLeaving(true);
    try {
      await apiLeaveEvent(eventId);
      showToast("You left the event");
      onSaved({ id: eventId, removed: true });
      onHide();
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setLeaving(false);
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

        {/* CREATOR ROW — visible at the top so you always know whose event it is */}
        {!loading && isEditMode && eventData && (
          <div className="sq-creator-row">
            {eventData.creator_picture ? (
              <img
                src={eventData.creator_picture}
                alt={eventData.creator_email}
                className="sq-creator-avatar"
              />
            ) : (
              <div
                className="sq-creator-avatar"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: "#fff",
                  background: "linear-gradient(135deg, #6366f1, #ec4899)",
                }}
              >
                {initials(eventData.creator_email || "")}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.78rem", color: "#6c757d" }}>Creado por</div>
              <strong style={{ color: "#e9ecef", fontSize: "0.9rem" }}>
                {eventData.creator_username || eventData.creator_email}
              </strong>
            </div>
            {eventData.going_count > 0 && (
              <Badge bg="info">{eventData.going_count} voy</Badge>
            )}
          </div>
        )}

        {/* ALWAYS-VISIBLE RESPONSE BAR (above tabs) — for invitees and accepted non-creators */}
        {!loading && isEditMode && eventData && !isCreator &&
         (eventData.my_status === "pending" || eventData.my_status === "accepted") && (
          <div className="sq-response-bar">
            {[
              { v: "going",     label: "Going",     icon: <FiCheckCircle /> },
              { v: "maybe",     label: "Maybe",     icon: <FiHelpCircle /> },
              { v: "not_going", label: "Not going",  icon: <FiXCircle /> },
            ].map((opt) => (
              <button
                key={opt.v}
                className={`sq-response-btn${eventData.my_rsvp === opt.v ? ` active-${opt.v}` : ""}`}
                disabled={respondBusy}
                onClick={() => handleRespond(opt.v)}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        )}

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

                {/* ─────────── VISIBILITY (public / private) ─────────── */}
                <Col xs={12}>
                  <Form.Label>Visibility</Form.Label>
                  <div className="visibility-toggle">
                    <button
                      type="button"
                      className={`vis-option ${!form.is_public ? "active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, is_public: false }))}
                      disabled={isEditMode && !isCreator}
                    >
                      <FiLock className="me-2" />
                      <span>
                        <strong>Private</strong>
                        <small>Only invited friends can see it</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`vis-option ${form.is_public ? "active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, is_public: true }))}
                      disabled={isEditMode && !isCreator}
                    >
                      <FiGlobe className="me-2" />
                      <span>
                        <strong>Public</strong>
                        <small>All your friends are invited &amp; notified</small>
                      </span>
                    </button>
                  </div>
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
                  {/* CURRENT PARTICIPANTS with their rsvp pill */}
                  <div className="small text-secondary text-uppercase fw-semibold mb-2">
                    Currently in ({participants.length})
                  </div>
                  <ListGroup className="mb-3">
                    {participants.map((p) => {
                      const rsvp = p.rsvp || "none";
                      const rsvpLabel = rsvp === "going" ? "Going"
                                      : rsvp === "maybe" ? "Maybe"
                                      : rsvp === "not_going" ? "Not going"
                                      : "—";
                      return (
                        <ListGroup.Item
                          key={p.id}
                          className="event-participant-row d-flex align-items-center justify-content-between"
                        >
                          <div className="d-flex align-items-center gap-2">
                            {p.profile_picture_url ? (
                              <img
                                src={p.profile_picture_url}
                                alt={p.email}
                                style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "1px solid #262a36" }}
                              />
                            ) : (
                              <div style={avatarStyle(p.id)}>{initials(p.email)}</div>
                            )}
                            <span>{p.email}</span>
                            {p.id === eventData?.creator_id && (
                              <Badge bg="info" className="ms-1">Creator</Badge>
                            )}
                            <Badge className={`sq-rsvp-pill ${rsvp}`}>{rsvpLabel}</Badge>
                          </div>
                          {isCreator && p.id !== eventData?.creator_id && (
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => handleRemoveMember(p.id)}
                              title="Remove from event"
                            >
                              <FiTrash2 />
                            </Button>
                          )}
                        </ListGroup.Item>
                      );
                    })}
                  </ListGroup>

                  {/* LEAVE EVENT — non-creator participants */}
                  {!isCreator && eventData?.my_status === "accepted" && (
                    <div className="mb-3">
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={handleLeave}
                        disabled={leaving}
                      >
                        {leaving ? <Spinner size="sm" animation="border" /> : <><FiLogOut className="me-1" /> Leave event</>}
                      </Button>
                    </div>
                  )}

                  {/* CREATOR: multi-select invite list */}
                  {isCreator && (
                    <>
                      <div className="small text-secondary text-uppercase fw-semibold mb-2 d-flex justify-content-between align-items-center">
                        <span>Invite friends</span>
                        {selectedToInvite.size > 0 && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={handleInviteBatch}
                          >
                            <FiUserPlus className="me-1" /> Invite ({selectedToInvite.size})
                          </Button>
                        )}
                      </div>
                      {friendsAvailable.length === 0 ? (
                        <div className="small text-secondary">No more friends to invite.</div>
                      ) : (
                        <div>
                          {friendsAvailable.map((u) => {
                            const isPending = pendingInviteIds.includes(u.id);
                            const selected  = selectedToInvite.has(u.id);
                            return (
                              <div
                                key={u.id}
                                className={`sq-friend-checkbox-row ${selected ? "selected" : ""}`}
                                onClick={() => {
                                  if (isPending) return;
                                  setSelectedToInvite((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(u.id)) next.delete(u.id);
                                    else next.add(u.id);
                                    return next;
                                  });
                                }}
                              >
                                {u.profile_picture_url ? (
                                  <img
                                    src={u.profile_picture_url}
                                    alt={u.email}
                                    style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "1px solid #262a36" }}
                                  />
                                ) : (
                                  <div style={avatarStyle(u.id)}>{initials(u.email)}</div>
                                )}
                                <span style={{ flex: 1 }}>{u.email}</span>
                                {isPending ? (
                                  <Badge bg="secondary">
                                    <FiClock className="me-1" /> Pending
                                  </Badge>
                                ) : (
                                  <Form.Check
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => { /* handled by row onClick */ }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* NON-CREATOR ACCEPTED PARTICIPANT: suggest friends to the creator */}
                  {!isCreator && eventData?.my_status === "accepted" && (
                    <>
                      <div className="small text-secondary text-uppercase fw-semibold mb-2 mt-4 d-flex justify-content-between align-items-center">
                        <span>Suggest inviting a friend</span>
                        {selectedToSuggest.size > 0 && (
                          <Button
                            size="sm"
                            variant="warning"
                            onClick={handleSuggestBatch}
                          >
                            <FiUserPlus className="me-1" /> Suggest ({selectedToSuggest.size})
                          </Button>
                        )}
                      </div>
                      <div className="small text-secondary mb-2">
                        The creator will be notified and will decide whether to send the invitation.
                      </div>
                      {friendsAvailable.length === 0 ? (
                        <div className="small text-secondary">You have no friends who aren't already in the event.</div>
                      ) : (
                        <div>
                          {friendsAvailable.map((u) => {
                            const selected = selectedToSuggest.has(u.id);
                            return (
                              <div
                                key={u.id}
                                className={`sq-friend-checkbox-row ${selected ? "selected" : ""}`}
                                onClick={() => {
                                  setSelectedToSuggest((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(u.id)) next.delete(u.id);
                                    else next.add(u.id);
                                    return next;
                                  });
                                }}
                              >
                                {u.profile_picture_url ? (
                                  <img
                                    src={u.profile_picture_url}
                                    alt={u.email}
                                    style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "1px solid #262a36" }}
                                  />
                                ) : (
                                  <div style={avatarStyle(u.id)}>{initials(u.email)}</div>
                                )}
                                <span style={{ flex: 1 }}>{u.email}</span>
                                <Form.Check
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => { /* handled by row onClick */ }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            );
                          })}
                        </div>
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
                      You don't have any friends yet. Add some on the Friends page.
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
                              {u.profile_picture_url ? (
                                <img
                                  src={u.profile_picture_url}
                                  alt={u.email}
                                  style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "1px solid #262a36" }}
                                />
                              ) : (
                                <div style={avatarStyle(u.id)}>{initials(u.email)}</div>
                              )}
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

            {/* ─────────── SUGGESTIONS (creator only) ─────────── */}
            {isEditMode && isCreator && (
              <Tab
                eventKey="suggestions"
                title={
                  <span>
                    <FiUserCheck className="me-1" /> Sugerencias{" "}
                    {suggestions.length > 0 && (
                      <Badge bg="warning" text="dark">{suggestions.length}</Badge>
                    )}
                  </span>
                }
              >
                {suggestionsLoading ? (
                  <div className="text-center py-3 text-secondary">
                    <Spinner size="sm" animation="border" />
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="text-center py-4 text-secondary small">
                    No pending suggestions.
                  </div>
                ) : (
                  <>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span className="small text-secondary">
                        {suggestions.length} pending suggestion{suggestions.length === 1 ? "" : "s"}
                      </span>
                      <div className="d-flex gap-2">
                        <Button
                          size="sm"
                          variant="outline-success"
                          onClick={handleApproveAllSuggestions}
                          disabled={suggestionsBusy}
                        >
                          <FiCheck className="me-1" /> Approve all
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={handleRefuseAllSuggestions}
                          disabled={suggestionsBusy}
                        >
                          <FiX className="me-1" /> Refuse all
                        </Button>
                      </div>
                    </div>
                    {suggestions.map((s) => {
                      const target = s.suggested_user || {};
                      const from   = s.suggested_by || {};
                      return (
                        <div key={s.id} className="sq-suggestion-row">
                          {target.profile_picture_url ? (
                            <img
                              src={target.profile_picture_url}
                              alt={target.email}
                              className="sq-suggestion-avatar"
                            />
                          ) : (
                            <div className="sq-suggestion-avatar" style={avatarStyle(target.id || 0)}>
                              {initials(target.email || "")}
                            </div>
                          )}
                          <div className="sq-suggestion-body">
                            <strong>{target.email || `User #${s.suggested_user_id}`}</strong>
                            <div className="sq-suggestion-from">
                              Sugerido por <strong>{from.email || `User #${s.suggested_by_id}`}</strong>
                            </div>
                          </div>
                          <div className="d-flex gap-2">
                            <Button
                              size="sm"
                              variant="outline-success"
                              onClick={() => handleApproveSuggestion(s.id)}
                              disabled={suggestionsBusy}
                              title="Approve and invite"
                            >
                              <FiCheck />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => handleRefuseSuggestion(s.id)}
                              disabled={suggestionsBusy}
                              title="Refuse"
                            >
                              <FiX />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </Tab>
            )}

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
                                title="Save"
                              >
                                <FiCheck />
                              </Button>
                              <Button
                                className="chat-edit-cancel"
                                onClick={cancelEdit}
                                title="Cancel"
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
                                title="Edit (15 min)"
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
                    title="Send photo"
                    disabled={isRecording || !!editingMsgId}
                  >
                    <FiImage />
                  </Button>
                  <Button
                    className={`chat-media-btn ${isRecording ? "recording" : ""}`}
                    onClick={toggleRecording}
                    title={isRecording ? "Stop and send audio" : "Record audio"}
                    disabled={!!editingMsgId}
                  >
                    {isRecording ? <FiSquare /> : <FiMic />}
                  </Button>
                  <Form.Control
                    placeholder={
                      isRecording
                        ? "Recording audio..."
                        : editingMsgId
                        ? "Editing a message..."
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
        {isEditMode && eventData?.chat_room_id && (
          <Button
            variant="outline-info"
            onClick={() => {
              const rid = eventData.chat_room_id;
              onHide();
              navigate(`/messages/${rid}`);
            }}
          >
            <FiMaximize2 className="me-1" /> Expand
          </Button>
        )}
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