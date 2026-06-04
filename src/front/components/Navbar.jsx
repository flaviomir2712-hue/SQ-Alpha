import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

import useGlobalReducer from "../hooks/useGlobalReducer";
import { api } from "../services/api";

import Container from "react-bootstrap/Container";
import NavbarBs from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import ListGroup from "react-bootstrap/ListGroup";
import Form from "react-bootstrap/Form";
import Dropdown from "react-bootstrap/Dropdown";
import InputGroup from "react-bootstrap/InputGroup";

import { NotificationBell } from "./NotificationBell.jsx";
import {
    FiMenu,
    FiMail,
    FiSend,
    FiUsers,
    FiLogOut,
    FiCalendar,
    FiArrowLeft,
    FiSearch,
    FiImage,
    FiMic,
    FiSquare,
    FiUser,
    FiEdit2,
    FiCheck,
    FiX,
    FiMaximize2,
    FiFilter,
} from "react-icons/fi";

// Options for the map time filter (number of days). null = no filter.
const MAP_FILTER_OPTIONS = [
    { value: null, label: "Todos" },
    { value: 1,    label: "Hoy y mañana" },
    { value: 3,    label: "Próximos 3 días" },
    { value: 7,    label: "Próxima semana" },
    { value: 14,   label: "Próximas 2 semanas" },
    { value: 30,   label: "Próximo mes" },
    { value: 90,   label: "Próximos 3 meses" },
];

const labelForFilter = (val) =>
    MAP_FILTER_OPTIONS.find((o) => o.value === val)?.label || "Todos";

// =====================================================
// LOCAL HELPERS (inlined so the navbar is self-contained)
// =====================================================
const API = import.meta.env.VITE_BACKEND_URL;

// Same window the backend enforces (15 min).
const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;

const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const fetchWithRetry = async (url, options = {}) => {
    let delay = 400;
    for (;;) {
        try {
            const res = await fetch(url, options);
            return res;
        } catch (_) {
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay * 2, 4000);
        }
    }
};

const getChatRooms = async (dispatch) => {
    const res = await fetchWithRetry(`${API}/api/chat/rooms`, { headers: authHeaders() });
    if (!res.ok) return;
    const rooms = await res.json();
    dispatch({ type: "set_chat_rooms", payload: rooms });
};

const getRoomMessages = async (roomId) => {
    const res = await fetchWithRetry(`${API}/api/chat/rooms/${roomId}/messages`, {
        headers: authHeaders(),
    });
    if (!res.ok) return { messages: [] };
    return res.json();
};

const sendRoomMessage = async (roomId, payload) => {
    const res = await fetchWithRetry(`${API}/api/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.msg || "Failed to send message");
    }
    return res.json();
};

const editRoomMessage = async (roomId, msgId, newText) => {
    const res = await fetchWithRetry(
        `${API}/api/chat/rooms/${roomId}/messages/${msgId}`,
        {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ text: newText }),
        }
    );
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.msg || "Failed to edit message");
    }
    return res.json();
};

const markRoomRead = async (roomId) => {
    try {
        await fetchWithRetry(`${API}/api/chat/rooms/${roomId}/read`, {
            method: "PUT",
            headers: authHeaders(),
        });
    } catch (_) {
        /* best-effort */
    }
};

const searchChats = async (q) => {
    const res = await fetchWithRetry(
        `${API}/api/chat/search?q=${encodeURIComponent(q)}`,
        { headers: authHeaders() }
    );
    if (!res.ok) return { event_rooms: [], friends: [] };
    return res.json();
};

const createOrGetDm = async (userId) => {
    const res = await fetchWithRetry(`${API}/api/chat/dm`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.msg || "Failed to start DM");
    }
    return res.json();
};

const fileToDataURL = (fileOrBlob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(fileOrBlob);
    });

// =====================================================
// STYLES (dark, coherent avec EventModal / Profile)
// =====================================================
const NAVBAR_CSS = `
.sq-navbar { background: #0f111a !important; border-bottom: 1px solid #262a36; }
.sq-navbar .navbar-brand { color: #fff; }

.sq-chat-modal .modal-content {
  background: #161922; color: #e9ecef;
  border: 1px solid #262a36; border-radius: 14px;
}
.sq-chat-modal .modal-header,
.sq-chat-modal .modal-footer { border-color: #262a36; }

/* Carte de chat */
.sq-chat-card {
  display: flex; align-items: center; gap: 0.75rem;
  background: #0f111a; border: 1px solid #262a36;
  border-radius: 12px; padding: 0.6rem 0.75rem; margin-bottom: 0.6rem;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  position: relative;
}
.sq-chat-card:hover {
  transform: translateY(-2px);
  border-color: #6366f1;
  box-shadow: 0 6px 16px rgba(99,102,241,0.15);
}
.sq-chat-card.has-unread { border-color: #6366f1; }

.sq-chat-avatar {
  width: 56px; height: 56px; border-radius: 12px;
  object-fit: cover; background: #1e2230; flex-shrink: 0;
  border: 1px solid #262a36;
}
.sq-chat-avatar-fallback {
  width: 56px; height: 56px; border-radius: 12px; flex-shrink: 0;
  background: linear-gradient(135deg, #6366f1, #ec4899);
  display: flex; align-items: center; justify-content: center; color: #fff;
  border: 1px solid #262a36;
}
.sq-chat-avatar-fallback.dm {
  background: linear-gradient(135deg, #ec4899, #f97316);
}

.sq-chat-card-body { flex: 1; min-width: 0; }
.sq-chat-card-row {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
}
.sq-chat-card-title {
  font-weight: 700; color: #fff; font-size: 1rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 0.4rem;
}
.sq-chat-card-time {
  font-size: 0.72rem; color: #6c757d; flex-shrink: 0;
}
.sq-chat-card-preview {
  font-size: 0.85rem; color: #adb5bd;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 0.15rem;
}
.sq-chat-card-empty {
  font-size: 0.8rem; color: #6c757d; font-style: italic;
  margin-top: 0.15rem;
}
.sq-chat-type-badge {
  background: #1e2230; color: #adb5bd;
  border: 1px solid #262a36;
  font-size: 0.6rem; font-weight: 700;
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.sq-chat-card-unread {
  background: #ef4444; color: #fff;
  font-size: 0.68rem; font-weight: 700;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  margin-left: 0.4rem;
  flex-shrink: 0;
}

/* Search */
.sq-chat-search-input {
  background: #0f111a !important; color: #e9ecef !important;
  border: 1px solid #262a36 !important;
}
.sq-chat-search-input::placeholder { color: #6c757d; }
.sq-chat-search-input:focus {
  border-color: #6366f1 !important;
  box-shadow: 0 0 0 0.15rem rgba(99,102,241,0.25) !important;
}
.sq-chat-search-prefix {
  background: #0f111a; border: 1px solid #262a36; border-right: 0;
  color: #adb5bd;
}
.sq-chat-section-title {
  color: #adb5bd; text-transform: uppercase;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em;
  margin: 0.75rem 0 0.4rem 0.1rem;
}
.sq-chat-empty-results {
  color: #6c757d; font-size: 0.85rem; font-style: italic;
  padding: 0.3rem 0.25rem 0.5rem;
}

/* Thread */
.sq-chat-thread {
  background: #0f111a; border: 1px solid #262a36; border-radius: 12px;
  height: 300px; overflow-y: auto; padding: 0.75rem;
}
.sq-chat-msg { margin-bottom: 0.6rem; position: relative; }
.sq-chat-msg .bubble {
  display: inline-block; padding: 0.4rem 0.7rem;
  border-radius: 10px; max-width: 80%;
  background: #1e2230; color: #e9ecef;
  text-align: left;
}
.sq-chat-msg.mine { text-align: right; }
.sq-chat-msg.mine .bubble {
  background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff;
}
.sq-chat-msg .meta { font-size: 0.72rem; color: #6c757d; }
.sq-chat-msg .meta-edited {
  font-size: 0.68rem; color: #6c757d; font-style: italic;
  margin-left: 0.3rem;
}
.sq-chat-msg .sq-chat-img {
  display: block; max-width: 220px; max-height: 220px;
  border-radius: 8px; object-fit: cover;
}
.sq-chat-msg .sq-chat-audio { display: block; max-width: 240px; }
.sq-chat-edit-btn {
  background: transparent !important; border: none !important;
  color: #adb5bd !important;
  font-size: 0.7rem !important;
  padding: 0 0.25rem !important;
  margin-left: 0.25rem;
  vertical-align: middle;
}
.sq-chat-edit-btn:hover { color: #fff !important; }
.sq-chat-edit-form {
  display: inline-flex; gap: 0.3rem; align-items: center;
  max-width: 90%;
}
.sq-chat-edit-input {
  background: #0f111a !important; color: #e9ecef !important;
  border: 1px solid #6366f1 !important;
  font-size: 0.85rem !important;
  padding: 0.3rem 0.5rem !important;
  min-width: 180px;
}
.sq-chat-edit-input:focus {
  box-shadow: 0 0 0 0.15rem rgba(99,102,241,0.25) !important;
}
.sq-chat-edit-save {
  background: #4f46e5 !important; border: none !important; color: #fff !important;
  font-size: 0.78rem !important; padding: 0.25rem 0.45rem !important;
}
.sq-chat-edit-cancel {
  background: #1e2230 !important; border: 1px solid #262a36 !important; color: #adb5bd !important;
  font-size: 0.78rem !important; padding: 0.25rem 0.45rem !important;
}

/* Media buttons */
.sq-chat-media-btn {
  background: #1e2230 !important; color: #adb5bd !important;
  border: 1px solid #262a36 !important;
}
.sq-chat-media-btn:hover { background: #262a36 !important; color: #fff !important; }
.sq-chat-media-btn.recording {
  background: #ef4444 !important; color: #fff !important;
  border-color: #ef4444 !important;
  animation: sq-pulse 1s ease-in-out infinite;
}
@keyframes sq-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
  50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
}

/* Fullscreen button in chat modal header */
.sq-chat-fullscreen-btn {
  border: 1px solid #262a36 !important;
  background: transparent !important;
  color: #adb5bd !important;
  padding: 0.25rem 0.5rem !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
}
.sq-chat-fullscreen-btn:hover {
  border-color: #6366f1 !important;
  color: #fff !important;
  background: rgba(99,102,241,0.1) !important;
}

/* Hamburger dropdown */
/* Map-filter toggle — smaller than the rest, sits next to the brand */
.sq-filter-toggle.dropdown-toggle::after { display: none; }
.sq-filter-toggle {
  background: rgba(255,255,255,0.06) !important;
  border: 1px solid #262a36 !important;
  border-radius: 999px !important;
  padding: 0.25rem 0.55rem !important;
  display: inline-flex !important;
  align-items: center;
  gap: 0.25rem;
  min-height: 28px;
}
.sq-filter-toggle:hover { background: rgba(255,255,255,0.12) !important; border-color: #6366f1 !important; }
.sq-filter-toggle:focus { box-shadow: none !important; }

.sq-menu-toggle.dropdown-toggle::after { display: none; }
.sq-menu-toggle {
  background: transparent !important; border: none !important;
  padding: 0.25rem 0.5rem;
}
.sq-menu-toggle:focus { box-shadow: none !important; }
.sq-menu-dropdown {
  background: #161922; border: 1px solid #262a36;
  color: #e9ecef; min-width: 220px;
}
.sq-menu-dropdown .dropdown-item { color: #e9ecef; }
.sq-menu-dropdown .dropdown-item:hover,
.sq-menu-dropdown .dropdown-item:focus { background: #1e2230; color: #fff; }
.sq-menu-dropdown .dropdown-header { color: #adb5bd; }
.sq-menu-dropdown .dropdown-divider { border-color: #262a36; }
.sq-menu-logout { color: #ff6b6b !important; }
.sq-menu-logout:hover { background: #2a1212 !important; color: #ff8a8a !important; }

@media (max-width: 575.98px) {
  .sq-navbar .navbar-brand { font-size: 1.5rem; }
  .sq-hide-xs { display: none !important; }
}
`;

// =====================================================
// HELPERS
// =====================================================
const getChatLabel = (room, currentUserId) => {
    if (room?.type === "event") {
        return room.event_title || "Chat de evento";
    }
    if (room?.type === "dm") {
        const p = room.dm_partner;
        if (p) return p.username || p.email || "Chat";
        const other = room?.participants?.find((u) => u.id !== currentUserId);
        return other?.email || "Chat";
    }
    return room?.event_title || "Chat";
};

const getPreviewText = (last) => {
    if (!last) return null;
    if (last.deleted) return "Mensaje eliminado";
    if (last.text) return last.text;
    if (last.media_type === "image") return "📷 Foto";
    if (last.media_type === "audio") return "🎤 Audio";
    return null;
};

const formatPreviewTime = (iso) => {
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

// Can the current user edit this message right now?
const canEditMessage = (m, currentUserId) => {
    if (m.sender_id !== currentUserId) return false;
    if (!m.text || m.deleted) return false;
    const created = new Date(m.created_at).getTime();
    if (Number.isNaN(created)) return false;
    return Date.now() - created < CHAT_EDIT_WINDOW_MS;
};

export const Navbar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { store, dispatch } = useGlobalReducer();

    const isLogged = !!localStorage.getItem("token");
    const cachedUser = (() => {
        try { return JSON.parse(localStorage.getItem("user") || "null"); }
        catch { return null; }
    })();
    const currentUserId = cachedUser?.id ?? store.user?.id ?? null;

    const [showMessages, setShowMessages] = useState(false);

    // selected chat
    const [activeRoom, setActiveRoom] = useState(null);
    const [messages, setMessages]     = useState([]);
    const [replyText, setReplyText]   = useState("");
    const threadRef = useRef(null);

    // edit-in-place
    const [editingMsgId, setEditingMsgId] = useState(null);
    const [editText, setEditText] = useState("");

    // search
    const [searchQ, setSearchQ] = useState("");
    const [searchResults, setSearchResults] = useState(null);

    // image input
    const imageInputRef = useRef(null);

    // audio recorder
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    // =====================================================
    // REDIRECT
    // =====================================================
    useEffect(() => {
        if (!isLogged) {
            const path = location.pathname;
            if (path !== "/login" && path !== "/register") {
                navigate("/login", { replace: true });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLogged, location.pathname]);

    // =====================================================
    // LOAD CHAT ROOMS + POLL
    // =====================================================
    useEffect(() => {
        if (!isLogged) return;
        getChatRooms(dispatch);
        const t = setInterval(() => getChatRooms(dispatch), 15000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLogged]);

    useEffect(() => {
        if (showMessages && isLogged) getChatRooms(dispatch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showMessages]);

    // poll messages while a chat is open
    useEffect(() => {
        if (!activeRoom) return;
        let cancelled = false;
        const load = async () => {
            const data = await getRoomMessages(activeRoom.id);
            if (!cancelled) setMessages(data.messages || []);
        };
        load();
        const t = setInterval(load, 4000);
        return () => { cancelled = true; clearInterval(t); };
    }, [activeRoom]);

    // autoscroll thread
    useEffect(() => {
        if (threadRef.current) {
            threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }
    }, [messages]);

    // debounced search
    useEffect(() => {
        const q = searchQ.trim();
        if (!q) { setSearchResults(null); return; }
        const handle = setTimeout(async () => {
            const data = await searchChats(q);
            setSearchResults(data);
        }, 300);
        return () => clearTimeout(handle);
    }, [searchQ]);

    // =====================================================
    // LOGOUT
    // =====================================================
    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        dispatch({ type: "logout" });
        navigate("/login", { replace: true });
    };

    // =====================================================
    // CHAT HANDLERS
    // =====================================================
    const openRoom = (room) => {
        setActiveRoom(room);
        setMessages([]);
        setReplyText("");
        setSearchQ("");
        setSearchResults(null);
        cancelEdit();

        if (room?.id) {
            dispatch({ type: "mark_room_read_local", payload: room.id });
            markRoomRead(room.id);
        }
    };

    const backToList = () => {
        setActiveRoom(null);
        setMessages([]);
        setReplyText("");
        cancelEdit();
        stopRecording(true);
        getChatRooms(dispatch);
    };

    const handleStartDm = async (userId) => {
        try {
            const data = await createOrGetDm(userId);
            const room = data.room;
            if (room) {
                dispatch({ type: "upsert_chat_room", payload: room });
                openRoom(room);
            }
        } catch (e) {
            console.error("Error starting DM:", e);
        }
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !activeRoom) return;
        try {
            await sendRoomMessage(activeRoom.id, { text: replyText });
            setReplyText("");
            const data = await getRoomMessages(activeRoom.id);
            setMessages(data.messages || []);
            getChatRooms(dispatch);
        } catch (e) {
            console.error("Error sending message:", e);
        }
    };

    const handlePickImage = () => {
        if (imageInputRef.current) imageInputRef.current.click();
    };

    const handleImageChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !activeRoom) return;
        try {
            // Compress big phone shots before sending — a 5 MB iPhone
            // photo becomes ~250 KB after compressImage("chat").
            let dataUrl;
            try {
                const { compressImage } = await import("../utils/uploadImage");
                dataUrl = await compressImage(file, "chat");
            } catch (compressErr) {
                console.error("Compression failed, sending raw:", compressErr);
                dataUrl = await fileToDataURL(file);
            }
            await sendRoomMessage(activeRoom.id, {
                media_url: dataUrl,
                media_type: "image",
            });
            const data = await getRoomMessages(activeRoom.id);
            setMessages(data.messages || []);
            getChatRooms(dispatch);
        } catch (err) {
            console.error("Error sending image:", err);
        }
    };

    const startRecording = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            console.warn("Audio recording not supported in this browser");
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
                if (!activeRoom) return;
                try {
                    const dataUrl = await fileToDataURL(blob);
                    await sendRoomMessage(activeRoom.id, {
                        media_url: dataUrl,
                        media_type: "audio",
                    });
                    const data = await getRoomMessages(activeRoom.id);
                    setMessages(data.messages || []);
                    getChatRooms(dispatch);
                } catch (err) {
                    console.error("Error sending audio:", err);
                }
            };
            mediaRecorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Microphone access denied:", err);
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

    // ----- edit handlers -----
    const beginEdit = (m) => {
        setEditingMsgId(m.id);
        setEditText(m.text || "");
    };

    const cancelEdit = () => {
        setEditingMsgId(null);
        setEditText("");
    };

    const saveEdit = async () => {
        if (!activeRoom || !editingMsgId) return;
        const trimmed = editText.trim();
        if (!trimmed) return;
        try {
            await editRoomMessage(activeRoom.id, editingMsgId, trimmed);
            cancelEdit();
            const data = await getRoomMessages(activeRoom.id);
            setMessages(data.messages || []);
            getChatRooms(dispatch);
        } catch (e) {
            console.error("Error editing message:", e);
            cancelEdit();
        }
    };

    const closeChatModal = () => {
        setShowMessages(false);
        backToList();
        setSearchQ("");
        setSearchResults(null);
    };

    // Abre el chat actual como página dedicada
    const openInFullscreen = () => {
        if (!activeRoom) return;
        const id = activeRoom.id;
        closeChatModal();
        navigate(`/messages/${id}`);
    };

    // =====================================================
    // RENDER
    // =====================================================
    const chatUnread = store.chatUnreadTotal || 0;
    const showingSearch = searchResults !== null;

    return (
        <>
            <style>{NAVBAR_CSS}</style>

            <NavbarBs variant="dark" className="sq-navbar px-3 py-2 fixed-top">
                <Container fluid className="d-flex justify-content-between align-items-center">

                    <div className="d-flex align-items-center gap-2">
                        <Link to="/" className="text-decoration-none">
                            <NavbarBs.Brand className="fw-bold fs-3 mb-0">
                                <img src="src/front/assets/img/logoSideQuest.png" alt="SideQuest" style={{ filter: "brightness(0) invert(1)", height: "40px", width:"auto" }} />
                            </NavbarBs.Brand>
                        </Link>

                        {/* MAP TIME FILTER — small, sits right next to the logo.
                            Only meaningful when logged in. */}
                        {isLogged && (
                            <Dropdown align="start">
                                <Dropdown.Toggle
                                    as={Button}
                                    variant="dark"
                                    className="sq-filter-toggle position-relative border-0 p-1"
                                    title="Filtrar eventos en el mapa"
                                >
                                    <FiFilter size={16} color="white" />
                                    {store.mapFilterDays !== null && store.mapFilterDays !== undefined && (
                                        <Badge
                                            bg="info"
                                            pill
                                            className="ms-1"
                                            style={{ fontSize: "0.55rem", verticalAlign: "middle" }}
                                        >
                                            {store.mapFilterDays}d
                                        </Badge>
                                    )}
                                </Dropdown.Toggle>
                                <Dropdown.Menu className="sq-menu-dropdown">
                                    <Dropdown.Header>Filtro de eventos</Dropdown.Header>
                                    <Dropdown.Divider />
                                    {MAP_FILTER_OPTIONS.map((opt) => {
                                        const isActive = (store.mapFilterDays ?? null) === opt.value;
                                        return (
                                            <Dropdown.Item
                                                key={String(opt.value)}
                                                active={isActive}
                                                onClick={() => dispatch({ type: "set_map_filter_days", payload: opt.value })}
                                            >
                                                {isActive && <FiCheck className="me-2" />}
                                                {!isActive && <span className="me-2" style={{ display: "inline-block", width: 14 }} />}
                                                {opt.label}
                                            </Dropdown.Item>
                                        );
                                    })}
                                </Dropdown.Menu>
                            </Dropdown>
                        )}
                    </div>

                    <Nav className="d-flex flex-row align-items-center gap-2 gap-md-3">
                        {isLogged ? (
                            <>
                                {/* NotificationBell is now always visible — on
                                    mobile too. Was previously hidden behind
                                    the `sq-hide-xs` wrapper. */}
                                <NotificationBell />

                                {/* FRIENDS — promoted out of the hamburger to a top-level icon */}
                                <Link to="/friends" className="text-decoration-none">
                                    <Button
                                        variant="dark"
                                        className="border-0 p-2"
                                        title="Friends"
                                    >
                                        <FiUsers size={24} color="white" />
                                    </Button>
                                </Link>

                                <Button
                                    variant="dark"
                                    className="position-relative border-0 p-2"
                                    onClick={() => setShowMessages(true)}
                                    title="Mis mensajes"
                                >
                                    <FiMail size={24} color="white" />
                                    {chatUnread > 0 && (
                                        <Badge
                                            bg="danger"
                                            pill
                                            className="position-absolute top-0 start-100 translate-middle"
                                            style={{ fontSize: "0.65rem" }}
                                        >
                                            {chatUnread > 99 ? "99+" : chatUnread}
                                        </Badge>
                                    )}
                                </Button>

                                <Dropdown align="end">
                                    <Dropdown.Toggle
                                        as={Button}
                                        variant="dark"
                                        className="sq-menu-toggle border-0"
                                    >
                                        <FiMenu size={28} color="white" />
                                    </Dropdown.Toggle>

                                    <Dropdown.Menu className="sq-menu-dropdown">
                                        <Dropdown.Header>
                                            Hola {cachedUser?.username
                                                ? `@${cachedUser.username}`
                                                : (cachedUser?.email || "—")}
                                        </Dropdown.Header>
                                        <Dropdown.Divider />

                                        <Dropdown.Item as={Link} to="/events">
                                            <FiCalendar className="me-2" /> Mis Eventos
                                        </Dropdown.Item>

                                        <Dropdown.Item as={Link} to="/messages">
                                            <FiMail className="me-2" /> Mis Chats
                                        </Dropdown.Item>

                                        <Dropdown.Divider />

                                        <Dropdown.Item
                                            onClick={handleLogout}
                                            className="sq-menu-logout"
                                        >
                                            <FiLogOut className="me-2" /> Salir
                                        </Dropdown.Item>
                                    </Dropdown.Menu>
                                </Dropdown>
                            </>
                        ) : (
                            <>
                                <Link to="/login">
                                    <Button variant="primary" size="sm" className="me-1">
                                        Ingresar
                                    </Button>
                                </Link>
                                <Link to="/register">
                                    <Button variant="success" size="sm">
                                        Registro
                                    </Button>
                                </Link>
                            </>
                        )}
                    </Nav>
                </Container>
            </NavbarBs>

            {/* ===== CHAT MODAL ===== */}
            <Modal
                show={showMessages}
                onHide={closeChatModal}
                centered
                dialogClassName="sq-chat-modal"
            >
                <Modal.Header closeButton closeVariant="white">
                    <Modal.Title className="d-flex align-items-center gap-2 flex-grow-1">
                        {activeRoom && (
                            <Button
                                variant="dark"
                                size="sm"
                                className="border-0 p-1"
                                onClick={backToList}
                                title="Volver a la lista"
                            >
                                <FiArrowLeft />
                            </Button>
                        )}
                        <span className="flex-grow-1">
                            {activeRoom
                                ? getChatLabel(activeRoom, currentUserId)
                                : "Tus Chats"}
                        </span>
                        {activeRoom && (
                            <Button
                                size="sm"
                                className="sq-chat-fullscreen-btn"
                                onClick={openInFullscreen}
                                title="Abrir en pantalla completa"
                            >
                                <FiMaximize2 />
                            </Button>
                        )}
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    {!activeRoom && (
                        <>
                            <InputGroup className="mb-2">
                                <InputGroup.Text className="sq-chat-search-prefix">
                                    <FiSearch />
                                </InputGroup.Text>
                                <Form.Control
                                    className="sq-chat-search-input"
                                    placeholder="Busca un chat de evento o un amigo..."
                                    value={searchQ}
                                    onChange={(e) => setSearchQ(e.target.value)}
                                />
                            </InputGroup>

                            {showingSearch ? (
                                <>
                                    <div className="sq-chat-section-title">
                                        Chats de eventos
                                    </div>
                                    {searchResults.event_rooms.length === 0 ? (
                                        <div className="sq-chat-empty-results">
                                            Sin resultados
                                        </div>
                                    ) : (
                                        searchResults.event_rooms.map((room) => (
                                            <RoomCard
                                                key={`er-${room.id}`}
                                                room={room}
                                                currentUserId={currentUserId}
                                                onClick={() => openRoom(room)}
                                            />
                                        ))
                                    )}

                                    <div className="sq-chat-section-title">
                                        Amigos
                                    </div>
                                    {searchResults.friends.length === 0 ? (
                                        <div className="sq-chat-empty-results">
                                            Sin resultados
                                        </div>
                                    ) : (
                                        searchResults.friends.map((f) => (
                                            <FriendCard
                                                key={`fr-${f.user.id}`}
                                                friend={f}
                                                onOpen={openRoom}
                                                onStartDm={handleStartDm}
                                            />
                                        ))
                                    )}
                                </>
                            ) : (
                                <>
                                    {(store.chatRooms || []).length === 0 ? (
                                        <p className="text-muted mb-0">
                                            No tienes chats activos. Crea/unete a un evento o busca un amigo para empezar.
                                        </p>
                                    ) : (
                                        <ListGroup variant="flush">
                                            {store.chatRooms.map((room) => (
                                                <RoomCard
                                                    key={room.id}
                                                    room={room}
                                                    currentUserId={currentUserId}
                                                    onClick={() => openRoom(room)}
                                                />
                                            ))}
                                        </ListGroup>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {activeRoom && (
                        <>
                            <div className="sq-chat-thread" ref={threadRef}>
                                {messages.length === 0 ? (
                                    <div className="text-secondary small text-center mt-4">
                                        No hay mensajes todavia. Escribe el primero.
                                    </div>
                                ) : (
                                    messages.map((m) => {
                                        const mine = m.sender_id === currentUserId;
                                        const isEditing = editingMsgId === m.id;
                                        const isDeleted = m.deleted;
                                        const hasImage = !isDeleted && m.media_type === "image" && m.media_url;
                                        const hasAudio = !isDeleted && m.media_type === "audio" && m.media_url;
                                        const showEditBtn = canEditMessage(m, currentUserId) && !isEditing;
                                        return (
                                            <div
                                                key={m.id}
                                                className={`sq-chat-msg ${mine ? "mine" : ""}`}
                                            >
                                                {!mine && (
                                                    <div className="meta">
                                                        {m.sender_email}
                                                    </div>
                                                )}

                                                {isEditing ? (
                                                    <div className="sq-chat-edit-form">
                                                        <Form.Control
                                                            className="sq-chat-edit-input"
                                                            value={editText}
                                                            onChange={(e) => setEditText(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") saveEdit();
                                                                if (e.key === "Escape") cancelEdit();
                                                            }}
                                                            autoFocus
                                                        />
                                                        <Button
                                                            className="sq-chat-edit-save"
                                                            onClick={saveEdit}
                                                            disabled={!editText.trim()}
                                                            title="Guardar"
                                                        >
                                                            <FiCheck />
                                                        </Button>
                                                        <Button
                                                            className="sq-chat-edit-cancel"
                                                            onClick={cancelEdit}
                                                            title="Cancelar"
                                                        >
                                                            <FiX />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="bubble">
                                                        {isDeleted ? (
                                                            <em style={{ color: "rgba(255,255,255,0.6)" }}>
                                                                🚫 Mensaje eliminado
                                                            </em>
                                                        ) : (
                                                            <>
                                                                {hasImage && (
                                                                    <img
                                                                        src={m.media_url}
                                                                        alt="foto"
                                                                        className="sq-chat-img"
                                                                    />
                                                                )}
                                                                {hasAudio && (
                                                                    <audio
                                                                        controls
                                                                        src={m.media_url}
                                                                        className="sq-chat-audio"
                                                                    />
                                                                )}
                                                                {m.text && <div>{m.text}</div>}
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="meta">
                                                    {new Date(m.created_at).toLocaleString()}
                                                    {m.edited_at && !isDeleted && (
                                                        <span className="meta-edited">(editado)</span>
                                                    )}
                                                    {showEditBtn && (
                                                        <Button
                                                            className="sq-chat-edit-btn"
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
                                    className="sq-chat-media-btn"
                                    onClick={handlePickImage}
                                    title="Enviar foto"
                                    disabled={isRecording || !!editingMsgId}
                                >
                                    <FiImage />
                                </Button>
                                <Button
                                    className={`sq-chat-media-btn ${isRecording ? "recording" : ""}`}
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
                                            : "Escribe un mensaje..."
                                    }
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSendReply();
                                    }}
                                    disabled={isRecording || !!editingMsgId}
                                />
                                <Button
                                    variant="primary"
                                    onClick={handleSendReply}
                                    disabled={isRecording || !!editingMsgId || !replyText.trim()}
                                >
                                    <FiSend />
                                </Button>
                            </InputGroup>

                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={handleImageChange}
                            />
                        </>
                    )}

                </Modal.Body>
                <Modal.Footer>
                    <Button variant="outline-light" onClick={closeChatModal}>
                        Cerrar
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

// =====================================================
// Sub-components for rendering rooms & friend search hits
// =====================================================
const RoomCard = ({ room, currentUserId, onClick }) => {
    const label = getChatLabel(room, currentUserId);
    const last = room.last_message;
    const preview = getPreviewText(last);
    const isDm = room.type === "dm";
    const unread = room.unread_count || 0;
    const avatarUrl = isDm
        ? room.dm_partner?.profile_picture_url
        : room.event_image;

    return (
        <div
            className={`sq-chat-card ${unread > 0 ? "has-unread" : ""}`}
            onClick={onClick}
        >
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt={label}
                    className="sq-chat-avatar"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
            ) : (
                <div className={`sq-chat-avatar-fallback ${isDm ? "dm" : ""}`}>
                    {isDm ? <FiUser size={22} /> : <FiCalendar size={22} />}
                </div>
            )}

            <div className="sq-chat-card-body">
                <div className="sq-chat-card-row">
                    <div className="sq-chat-card-title">
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {label}
                        </span>
                        <span className="sq-chat-type-badge">
                            {isDm ? "DM" : "Evento"}
                        </span>
                    </div>
                    {last && (
                        <div className="sq-chat-card-time">
                            {formatPreviewTime(last.created_at)}
                        </div>
                    )}
                </div>
                <div className="sq-chat-card-row">
                    {preview ? (
                        <div className="sq-chat-card-preview" title={preview}>
                            {last.sender_id === currentUserId ? "Tu: " : ""}
                            {preview}
                        </div>
                    ) : (
                        <div className="sq-chat-card-empty">
                            No messages yet
                        </div>
                    )}
                    {unread > 0 && (
                        <span className="sq-chat-card-unread">
                            {unread > 99 ? "99+" : unread}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

const FriendCard = ({ friend, onOpen, onStartDm }) => {
    const u = friend.user;
    const label = u.username || u.email;
    const room = friend.room;

    const handleClick = () => {
        if (room) onOpen(room);
        else onStartDm(u.id);
    };

    return (
        <div className="sq-chat-card" onClick={handleClick}>
            {u.profile_picture_url ? (
                <img
                    src={u.profile_picture_url}
                    alt={label}
                    className="sq-chat-avatar"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
            ) : (
                <div className="sq-chat-avatar-fallback dm">
                    <FiUser size={22} />
                </div>
            )}
            <div className="sq-chat-card-body">
                <div className="sq-chat-card-row">
                    <div className="sq-chat-card-title">
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {label}
                        </span>
                        <span className="sq-chat-type-badge">
                            {room ? "Abrir DM" : "Nuevo DM"}
                        </span>
                    </div>
                </div>
                <div className="sq-chat-card-preview">
                    {room ? "Conversacion existente" : "Iniciar conversacion 1 a 1"}
                </div>
            </div>
        </div>
    );
};