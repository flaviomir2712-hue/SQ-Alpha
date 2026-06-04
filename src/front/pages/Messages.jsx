import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Container, Row, Col, Button, Form, InputGroup, Spinner, Modal,
} from "react-bootstrap";
import {
  FiSearch, FiArrowLeft, FiSend, FiImage, FiMic, FiSquare,
  FiUser, FiCalendar, FiEdit2, FiTrash2, FiCheck, FiX,
  FiMessageSquare,
} from "react-icons/fi";

import useGlobalReducer from "../hooks/useGlobalReducer.jsx";
import { useChat } from "../hooks/useChat.jsx";
import { api } from "../services/api";

import "./messages.css";

// Edit window (must match backend: 15 min).
const EDIT_WINDOW_MS = 15 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────
// Small visual helpers
// ─────────────────────────────────────────────────────────────────
const getRoomLabel = (room, currentUserId) => {
  if (!room) return "";
  if (room.type === "event") return room.event_title || "Event chat";
  if (room.type === "dm") {
    const p = room.dm_partner;
    if (p) return p.username || p.email || "Chat";
    const other = room?.participants?.find((u) => u.id !== currentUserId);
    return other?.email || "Chat";
  }
  return "Chat";
};

const getRoomAvatarUrl = (room) => {
  if (!room) return null;
  if (room.type === "dm") return room.dm_partner?.profile_picture_url || null;
  return room.event_image || null;
};

const getPreviewText = (last) => {
  if (!last) return null;
  if (last.deleted) return "Message deleted";
  if (last.text) return last.text;
  if (last.media_type === "image") return "📷 Foto";
  if (last.media_type === "audio") return "🎤 Audio";
  return null;
};

const formatTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
};

const formatFullTime = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const canEditMessage = (m, currentUserId) => {
  if (m.sender_id !== currentUserId) return false;
  if (!m.text || m.deleted) return false;
  const t = new Date(m.created_at).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < EDIT_WINDOW_MS;
};

const canDeleteMessage = (m, currentUserId) =>
  m.sender_id === currentUserId && !m.deleted && !m._optimistic;

const fileToDataURL = (fileOrBlob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBlob);
  });

// ─────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────
const Messages = () => {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { store } = useGlobalReducer();

  const cachedUser = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); }
    catch { return null; }
  })();
  const currentUserId = cachedUser?.id ?? store.user?.id ?? null;

  // ── Rooms list state ─────────────────────────────
  const [rooms, setRooms]             = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQ, setSearchQ]         = useState("");
  const [searchResults, setSearchResults] = useState(null);

  // ── Selected room ─────────────────────────────────
  const selectedRoomId = roomId ? parseInt(roomId, 10) : null;
  // Defensive: rooms might not be an array if API returned weird data
  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const selectedRoom = safeRooms.find((r) => r.id === selectedRoomId) || null;

  // ── Hook for the open conversation ───────────────
  const {
    messages, loading, sending,
    sendMessage, editMessage, deleteMessage,
  } = useChat(selectedRoomId);

  // ── UI state for sending/edit ────────────────────
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isRecording, setIsRecording] = useState(false);

  // refs
  const threadRef     = useRef(null);
  const imageInputRef = useRef(null);
  const mediaRecRef   = useRef(null);
  const audioChunksRef = useRef([]);

  // ── Load rooms + poll ─────────────────────────────
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await api.get("/chat/rooms");
        if (alive) setRooms(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("load rooms:", e);
        if (alive) setRooms([]);
      } finally {
        if (alive) setLoadingList(false);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // ── Debounced search ──────────────────────────────
  useEffect(() => {
    const q = searchQ.trim();
    if (!q) { setSearchResults(null); return; }
    const handle = setTimeout(async () => {
      try {
        const data = await api.get(`/chat/search?q=${encodeURIComponent(q)}`);
        setSearchResults({
          event_rooms: Array.isArray(data?.event_rooms) ? data.event_rooms : [],
          friends:     Array.isArray(data?.friends) ? data.friends : [],
        });
      } catch (e) {
        console.error("search:", e);
        setSearchResults({ event_rooms: [], friends: [] });
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQ]);

  // ── Autoscroll on new messages ────────────────────
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, selectedRoomId]);

  // ── Reset edit/draft when changing room ──────────
  useEffect(() => {
    setEditingId(null);
    setEditingText("");
    setDraft("");
    stopRecording(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId]);

  // ─────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────
  const openRoom = (room) => {
    setSearchQ("");
    setSearchResults(null);
    navigate(`/messages/${room.id}`);
  };

  const handleStartDm = async (userId) => {
    try {
      const data = await api.post("/chat/dm", { user_id: userId });
      const room = data?.room;
      if (room) {
        setRooms((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const idx = list.findIndex((r) => r.id === room.id);
          if (idx === -1) return [room, ...list];
          const copy = [...list]; copy[idx] = room; return copy;
        });
        openRoom(room);
      }
    } catch (e) { console.error("start DM:", e); }
  };

  const handleSubmitText = async (e) => {
    e?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    await sendMessage({ text: trimmed });
    setDraft("");
  };

  const handlePickImage = () => {
    if (imageInputRef.current) imageInputRef.current.click();
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToDataURL(file);
      await sendMessage({ media_url: dataUrl, media_type: "image" });
    } catch (err) { console.error("image:", err); }
  };

  // ── Audio recording ──────────────────────────────
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (!chunks.length || !selectedRoomId) return;
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const dataUrl = await fileToDataURL(blob);
          await sendMessage({ media_url: dataUrl, media_type: "audio" });
        } catch (err) { console.error("audio:", err); }
      };
      mediaRecRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone denied:", err);
    }
  };

  function stopRecording(cancel = false) {
    const rec = mediaRecRef.current;
    if (!rec) return;
    if (cancel) audioChunksRef.current = [];
    if (rec.state !== "inactive") {
      try { rec.stop(); } catch (_) { /* ignore */ }
    }
    mediaRecRef.current = null;
    setIsRecording(false);
  }

  const toggleRecording = () => {
    if (isRecording) stopRecording(false);
    else startRecording();
  };

  // ── Edit ─────────────────────────────────────────
  const beginEdit = (m) => {
    setEditingId(m.id);
    setEditingText(m.text || "");
  };
  const cancelEdit = () => { setEditingId(null); setEditingText(""); };
  const saveEdit = async () => {
    if (!editingId) return;
    const t = editingText.trim();
    if (!t) return;
    await editMessage(editingId, t);
    cancelEdit();
  };

  // ── Delete ───────────────────────────────────────
  const confirmDelete = (m) => setDeleteTarget(m);
  const doDelete = async () => {
    if (!deleteTarget) return;
    await deleteMessage(deleteTarget.id);
    setDeleteTarget(null);
  };

  // ─────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────
  const showingSearch = searchResults !== null;
  const safeMessages = Array.isArray(messages) ? messages : [];

  return (
    <Container fluid className="sq-msg-page">
      <Row className="g-0 sq-msg-layout">
        {/* ─────── LISTA ─────── */}
        <Col
          xs={12} md={4} lg={3}
          className={`sq-msg-list ${selectedRoom ? "d-none d-md-flex" : ""}`}
        >
          <div className="sq-msg-list-header">
            <h5 className="m-0 d-flex align-items-center gap-2">
              <FiMessageSquare /> Tus Chats
            </h5>
          </div>

          <div className="sq-msg-list-search">
            <InputGroup>
              <InputGroup.Text className="sq-msg-search-prefix">
                <FiSearch />
              </InputGroup.Text>
              <Form.Control
                className="sq-msg-search-input"
                placeholder="Search for an event or friend…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
            </InputGroup>
          </div>

          <div className="sq-msg-list-body">
            {loadingList ? (
              <div className="text-center p-4"><Spinner size="sm" /></div>
            ) : showingSearch ? (
              <>
                <div className="sq-msg-section">Event chats</div>
                {(searchResults?.event_rooms || []).length === 0 ? (
                  <div className="sq-msg-empty">No results</div>
                ) : (
                  searchResults.event_rooms.map((r) => (
                    <RoomItem
                      key={`er-${r.id}`}
                      room={r}
                      currentUserId={currentUserId}
                      active={r.id === selectedRoomId}
                      onClick={() => openRoom(r)}
                    />
                  ))
                )}

                <div className="sq-msg-section">Friends</div>
                {(searchResults?.friends || []).length === 0 ? (
                  <div className="sq-msg-empty">No results</div>
                ) : (
                  searchResults.friends.map((f) => (
                    <FriendItem
                      key={`fr-${f.user.id}`}
                      friend={f}
                      onOpen={openRoom}
                      onStartDm={handleStartDm}
                    />
                  ))
                )}
              </>
            ) : (
              safeRooms.length === 0 ? (
                <div className="sq-msg-empty">
                  You have no active chats.
                  <div className="mt-2">
                    <Link to="/friends" className="sq-msg-link">Find a friend</Link>{" "}
                    o{" "}
                    <Link to="/events" className="sq-msg-link">create an event</Link>.
                  </div>
                </div>
              ) : (
                safeRooms.map((r) => (
                  <RoomItem
                    key={r.id}
                    room={r}
                    currentUserId={currentUserId}
                    active={r.id === selectedRoomId}
                    onClick={() => openRoom(r)}
                  />
                ))
              )
            )}
          </div>
        </Col>

        {/* ─────── THREAD ─────── */}
        <Col
          xs={12} md={8} lg={9}
          className={`sq-msg-thread-wrap ${!selectedRoom ? "d-none d-md-flex" : ""}`}
        >
          {!selectedRoom ? (
            <div className="sq-msg-empty-thread">
              <FiMessageSquare size={48} className="mb-3" />
              <h5 className="mb-1">Select a conversation</h5>
              <p className="text-muted m-0">Pick a chat from the list to get started.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="sq-msg-thread-header">
                <Button
                  variant="dark"
                  className="border-0 sq-msg-back d-md-none"
                  onClick={() => navigate("/messages")}
                  title="Back"
                >
                  <FiArrowLeft />
                </Button>

                <RoomAvatar room={selectedRoom} />

                <div className="sq-msg-thread-title">
                  <div className="sq-msg-thread-name">
                    {getRoomLabel(selectedRoom, currentUserId)}
                  </div>
                  <div className="sq-msg-thread-sub">
                    {selectedRoom.type === "dm"
                      ? "DM"
                      : selectedRoom.event_title
                        ? `Event · ${selectedRoom.participants?.length || 0} participants`
                        : "Event"}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="sq-msg-thread" ref={threadRef}>
                {loading && safeMessages.length === 0 ? (
                  <div className="text-center pt-4">
                    <Spinner size="sm" variant="light" />
                  </div>
                ) : safeMessages.length === 0 ? (
                  <div className="sq-msg-empty-msgs">
                    No messages yet. Write the first one 👇
                  </div>
                ) : (
                  safeMessages.map((m) => {
                    const mine = m.sender_id === currentUserId;
                    return (
                      <MessageBubble
                        key={m.id}
                        m={m} mine={mine}
                        editing={editingId === m.id}
                        editingText={editingText}
                        setEditingText={setEditingText}
                        onBeginEdit={beginEdit}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={saveEdit}
                        onDelete={confirmDelete}
                        canEdit={canEditMessage(m, currentUserId)}
                        canDelete={canDeleteMessage(m, currentUserId)}
                      />
                    );
                  })
                )}
              </div>

              {/* Input */}
              <div className="sq-msg-composer">
                <Form onSubmit={handleSubmitText}>
                  <InputGroup>
                    <Button
                      className="sq-msg-icon-btn"
                      type="button"
                      onClick={handlePickImage}
                      disabled={isRecording || !!editingId}
                      title="Send photo"
                    >
                      <FiImage />
                    </Button>
                    <Button
                      className={`sq-msg-icon-btn ${isRecording ? "recording" : ""}`}
                      type="button"
                      onClick={toggleRecording}
                      disabled={!!editingId}
                      title={isRecording ? "Stop and send" : "Record audio"}
                    >
                      {isRecording ? <FiSquare /> : <FiMic />}
                    </Button>
                    <Form.Control
                      className="sq-msg-input"
                      placeholder={
                        isRecording
                          ? "Grabando audio…"
                          : editingId
                            ? "Editing a message above…"
                            : "Write a message…"
                      }
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={isRecording || !!editingId}
                    />
                    <Button
                      type="submit"
                      className="sq-msg-send-btn"
                      disabled={isRecording || !!editingId || !draft.trim() || sending}
                    >
                      {sending ? <Spinner size="sm" /> : <FiSend />}
                    </Button>
                  </InputGroup>
                </Form>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImageChange}
                />
              </div>
            </>
          )}
        </Col>
      </Row>

      {/* Delete confirm modal */}
      <Modal
        show={!!deleteTarget}
        onHide={() => setDeleteTarget(null)}
        centered
        contentClassName="sq-msg-modal"
      >
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title>Delete message</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this message? It will be shown as
          <strong> "Message deleted"</strong> in the conversation.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-light" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={doDelete}>
            <FiTrash2 className="me-1" /> Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

const RoomAvatar = ({ room }) => {
  const url = getRoomAvatarUrl(room);
  const isDm = room?.type === "dm";
  if (url) {
    return <img src={url} alt="" className="sq-msg-avatar"
      onError={(e) => { e.currentTarget.style.display = "none"; }} />;
  }
  return (
    <div className={`sq-msg-avatar-fallback ${isDm ? "dm" : ""}`}>
      {isDm ? <FiUser /> : <FiCalendar />}
    </div>
  );
};

const RoomItem = ({ room, currentUserId, active, onClick }) => {
  const label = getRoomLabel(room, currentUserId);
  const preview = getPreviewText(room.last_message);
  const last = room.last_message;
  const unread = room.unread_count || 0;
  const isDm = room.type === "dm";

  return (
    <div
      className={`sq-msg-room ${active ? "active" : ""} ${unread > 0 ? "has-unread" : ""}`}
      onClick={onClick}
    >
      <RoomAvatar room={room} />
      <div className="sq-msg-room-body">
        <div className="sq-msg-room-row">
          <div className="sq-msg-room-title">
            {label}
            <span className="sq-msg-room-type">{isDm ? "DM" : "Event"}</span>
          </div>
          {last && (
            <div className="sq-msg-room-time">{formatTime(last.created_at)}</div>
          )}
        </div>
        <div className="sq-msg-room-row">
          {preview ? (
            <div className="sq-msg-room-preview">
              {last.sender_id === currentUserId ? "Tú: " : ""}{preview}
            </div>
          ) : (
            <div className="sq-msg-room-preview muted">No messages</div>
          )}
          {unread > 0 && (
            <span className="sq-msg-room-unread">{unread > 99 ? "99+" : unread}</span>
          )}
        </div>
      </div>
    </div>
  );
};

const FriendItem = ({ friend, onOpen, onStartDm }) => {
  const u = friend.user;
  const label = u.username || u.email;
  const room = friend.room;
  const handle = () => (room ? onOpen(room) : onStartDm(u.id));

  return (
    <div className="sq-msg-room" onClick={handle}>
      {u.profile_picture_url ? (
        <img src={u.profile_picture_url} alt="" className="sq-msg-avatar"
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : (
        <div className="sq-msg-avatar-fallback dm"><FiUser /></div>
      )}
      <div className="sq-msg-room-body">
        <div className="sq-msg-room-row">
          <div className="sq-msg-room-title">
            {label}
            <span className="sq-msg-room-type">{room ? "Abrir DM" : "Nuevo DM"}</span>
          </div>
        </div>
        <div className="sq-msg-room-preview muted">
          {room ? "Existing conversation" : "Start a 1-on-1 conversation"}
        </div>
      </div>
    </div>
  );
};

const MessageBubble = ({
  m, mine, editing, editingText, setEditingText,
  onBeginEdit, onCancelEdit, onSaveEdit, onDelete,
  canEdit, canDelete,
}) => {
  if (m.deleted) {
    return (
      <div className={`sq-msg-row ${mine ? "mine" : ""}`}>
        <div className="sq-msg-bubble deleted">
          <em>🚫 Message deleted</em>
          <div className="sq-msg-meta">{formatFullTime(m.created_at)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`sq-msg-row ${mine ? "mine" : ""}`}>
      {!mine && <div className="sq-msg-sender">{m.sender_email}</div>}

      {editing ? (
        <div className="sq-msg-edit">
          <Form.Control
            className="sq-msg-edit-input"
            value={editingText}
            autoFocus
            onChange={(e) => setEditingText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
          />
          <Button size="sm" className="sq-msg-edit-save" onClick={onSaveEdit}>
            <FiCheck />
          </Button>
          <Button size="sm" className="sq-msg-edit-cancel" onClick={onCancelEdit}>
            <FiX />
          </Button>
        </div>
      ) : (
        <div className={`sq-msg-bubble ${m._optimistic ? "pending" : ""} ${m._failed ? "failed" : ""}`}>
          {m.media_type === "image" && m.media_url && (
            <img src={m.media_url} alt="foto" className="sq-msg-img" />
          )}
          {m.media_type === "audio" && m.media_url && (
            <audio controls src={m.media_url} className="sq-msg-audio" />
          )}
          {m.text && <div className="sq-msg-text">{m.text}</div>}

          <div className="sq-msg-meta">
            {formatFullTime(m.created_at)}
            {m.edited_at && <span className="sq-msg-edited"> · editado</span>}
            {m._optimistic && <span> · enviando…</span>}
            {m._failed && <span> · ❌ falló</span>}
          </div>

          {(canEdit || canDelete) && (
            <div className="sq-msg-actions">
              {canEdit && (
                <Button
                  size="sm"
                  className="sq-msg-action-btn"
                  onClick={() => onBeginEdit(m)}
                  title="Editar (15 min)"
                >
                  <FiEdit2 />
                </Button>
              )}
              {canDelete && (
                <Button
                  size="sm"
                  className="sq-msg-action-btn danger"
                  onClick={() => onDelete(m)}
                  title="Delete"
                >
                  <FiTrash2 />
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Messages;