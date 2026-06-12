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
// Tanda 4C — Re-disparar el tour de onboarding desde el menú.
// Onboarding.jsx escucha este evento custom y se reabre.
import { SHOW_ONBOARDING_EVENT } from "./Onboarding.jsx";
// Tanda 7A — "My Profile" vive ahora en este menú (antes estaba en el
// pill nav). El modal de perfil sigue montado dentro de ButtonNavbar
// (siempre presente via Layout); lo abrimos con el mismo patrón de
// evento custom que el onboarding.
import { SHOW_PROFILE_EVENT } from "./ButtonNavbar.jsx";
// Tanda 7D — limpieza de la sesión local (user + csrf) en el logout.
import { clearSession } from "../services/auth.js";
// Tanda 7F — socket en tiempo real (chat + notificaciones).
import { getSocket, disconnectSocket } from "../services/socket.js";
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
    FiGlobe,
    FiLock,
    FiCheckCircle,
    FiHelpCircle,
    FiXCircle,
    FiUserPlus,
    FiStar,
    FiRotateCcw,
} from "react-icons/fi";

// =====================================================
// MAP FILTER OPTIONS — every label is English on purpose.
// "All" means "no restriction" on that dimension.
// =====================================================
const MAP_FILTER_TIME_OPTIONS = [
    { value: null, label: "All upcoming" },
    { value: 0,    label: "Today" },           // 0 → today only (days === 0)
    { value: 1,    label: "Today & tomorrow" },
    { value: 3,    label: "Next 3 days" },
    { value: 7,    label: "Next week" },
    { value: 14,   label: "Next 2 weeks" },
    { value: 30,   label: "Next month" },
    { value: 90,   label: "Next 3 months" },
];

const MAP_FILTER_VISIBILITY_OPTIONS = [
    { value: "all",     label: "All",     icon: <FiGlobe size={14} /> },
    { value: "public",  label: "Public",  icon: <FiGlobe size={14} /> },
    { value: "private", label: "Private", icon: <FiLock  size={14} /> },
];

const MAP_FILTER_STATUS_OPTIONS = [
    { value: "all",       label: "All",           icon: <FiUsers       size={14} /> },
    { value: "going",     label: "Going",         icon: <FiCheckCircle size={14} /> },
    { value: "maybe",     label: "Maybe",         icon: <FiHelpCircle  size={14} /> },
    { value: "not_going", label: "Not going",     icon: <FiXCircle     size={14} /> },
    { value: "pending",   label: "Invited",       icon: <FiUserPlus    size={14} /> },
    { value: "created",   label: "Created by me", icon: <FiStar        size={14} /> },
];

// =====================================================
// LOCAL HELPERS (inlined so the navbar is self-contained)
// =====================================================
const API = import.meta.env.VITE_BACKEND_URL;

// Same window the backend enforces (15 min).
const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;

// Tanda 7D — la autenticación viaja en la cookie httpOnly + X-CSRF-TOKEN,
// añadidos por el parche global de fetch (services/auth.js).
const authHeaders = () => ({
    "Content-Type": "application/json",
});

// Tanda 7H — Retry SOLO para GET y con tope (antes: bucle infinito para
// CUALQUIER método). Dos peligros del comportamiento viejo:
//   - mutaciones reintentadas: si el POST de un mensaje llega al server
//     pero la respuesta se pierde en la red, el bucle reenviaba →
//     mensaje DUPLICADO. Ahora POST/PUT/DELETE hacen UN solo intento.
//   - bucles zombi: con el backend caído, cada llamada quedaba
//     reintentando para siempre (incluso tras desmontar el componente).
// Devuelve null cuando el intento (o los reintentos) fallan por red —
// los callers chequean `res?.ok` y conservan su último estado bueno.
const MAX_GET_RETRIES = 3;
const fetchWithRetry = async (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const maxRetries = method === "GET" ? MAX_GET_RETRIES : 0;
    let delay = 400;
    for (let attempt = 0; ; attempt++) {
        try {
            return await fetch(url, options);
        } catch (_) {
            if (attempt >= maxRetries) return null;
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay * 2, 4000);
        }
    }
};

const getChatRooms = async (dispatch) => {
    const res = await fetchWithRetry(`${API}/api/chat/rooms`, { headers: authHeaders() });
    // Fallo de red / backend caído → conservamos el store tal cual
    // (nada de vaciar listas por un blip transitorio).
    if (!res?.ok) return;
    const rooms = await res.json();
    dispatch({ type: "set_chat_rooms", payload: rooms });
};

const getRoomMessages = async (roomId) => {
    const res = await fetchWithRetry(`${API}/api/chat/rooms/${roomId}/messages`, {
        headers: authHeaders(),
    });
    // Tanda 7H — null (no {messages: []}): los callers distinguen "no
    // pude cargar" (conservan el hilo visible) de "hilo vacío real".
    if (!res?.ok) return null;
    return res.json();
};

const sendRoomMessage = async (roomId, payload) => {
    const res = await fetchWithRetry(`${API}/api/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
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
    if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
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
    if (!res?.ok) return { event_rooms: [], friends: [] };
    return res.json();
};

const createOrGetDm = async (userId) => {
    const res = await fetchWithRetry(`${API}/api/chat/dm`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ user_id: userId }),
    });
    if (!res?.ok) {
        const data = res ? await res.json().catch(() => ({})) : {};
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

// Active filter count — used to show a numeric badge on the funnel icon
// so the user knows at a glance how many dimensions are constraining
// what they see on the map.
const countActiveFilters = (days, visibility, status) => {
    let n = 0;
    if (days !== null && days !== undefined) n += 1;
    if (visibility && visibility !== "all")  n += 1;
    if (status     && status     !== "all")  n += 1;
    return n;
};

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

/* Tanda 7E — Lista de chats con scroll interno: a partir de ~5
   conversaciones (cada carta ≈ 82px) el modal deja de crecer; el
   resto se alcanza scrolleando DENTRO de la lista. Barra de scroll
   oculta (Firefox + WebKit) para mantener el look limpio del modal. */
.sq-chat-rooms-scroll {
  max-height: min(420px, 55vh);
  overflow-y: auto;
  scrollbar-width: none;          /* Firefox */
  -ms-overflow-style: none;       /* IE/Edge legacy */
}
.sq-chat-rooms-scroll::-webkit-scrollbar { display: none; }  /* WebKit */

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

 /* Wider menu for the 3-section filter dropdown */
 .sq-filter-dropdown {
   background: #161922; border: 1px solid #262a36;
   color: #e9ecef; min-width: 260px;
   padding-top: 0.25rem;
   max-height: 70vh;
   overflow-y: auto;
 }
 .sq-filter-dropdown .dropdown-item { color: #e9ecef; font-size: 0.88rem; }
 .sq-filter-dropdown .dropdown-item:hover,
 .sq-filter-dropdown .dropdown-item:focus { background: #1e2230; color: #fff; }
 .sq-filter-dropdown .dropdown-item.active,
 .sq-filter-dropdown .dropdown-item:active { background: rgba(99,102,241,0.18) !important; color: #fff !important; }
 .sq-filter-dropdown .dropdown-header {
   color: #adb5bd;
   text-transform: uppercase;
   font-size: 0.7rem;
   letter-spacing: 0.05em;
   font-weight: 700;
   padding-top: 0.4rem;
 }
 .sq-filter-dropdown .dropdown-divider { border-color: #262a36; }
 .sq-filter-reset {
   color: #f43f5e !important;
   font-weight: 600;
 }
 .sq-filter-reset:hover { background: #2a1212 !important; color: #ff8a8a !important; }
 .sq-filter-badge {
   background: #6366f1 !important;
   color: #fff !important;
   font-size: 0.6rem !important;
   font-weight: 700;
   padding: 0.15rem 0.4rem !important;
 }

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
 }
 `;

// =====================================================
// HELPERS
// =====================================================
const getChatLabel = (room, currentUserId) => {
    if (room?.type === "event") {
        return room.event_title || "Event chat";
    }
    if (room?.type === "dm") {
        const p = room.dm_partner;
        // RGPD: el label del DM es el @username del partner. NUNCA
        // su email, aunque el partner sea anónimo (cambió username).
        if (p) return p.username ? `@${p.username}` : "Chat";
        const other = room?.participants?.find((u) => u.id !== currentUserId);
        return other?.username ? `@${other.username}` : "Chat";
    }
    return room?.event_title || "Chat";
};

const getPreviewText = (last) => {
    if (!last) return null;
    if (last.deleted) return "Mensaje eliminado";
    if (last.text) return last.text;
    if (last.media_type === "image") return "📷 Photo";
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

    const cachedUser = (() => {
        try { return JSON.parse(localStorage.getItem("user") || "null"); }
        catch { return null; }
    })();
    // Tanda 7D — el JWT vive en una cookie httpOnly que JS no puede leer:
    // la señal de sesión en UI es el user persistido. Si la cookie real
    // ya no vale, el primer 401 limpia la sesión y redirige (api.js).
    const isLogged = !!cachedUser;
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
    // REDIRECT — usuarios no logueados solo pueden estar en
    // un conjunto cerrado de rutas públicas. Cualquier otra
    // ruta los manda a /login.
    //
    // RGPD / SEO: las páginas legales (/terms /privacy /legal)
    // DEBEN ser accesibles sin estar logueado:
    //   - Obligación legal (LCEN, LSSI, RGPD): los términos y la
    //     política de privacidad son condición previa para que
    //     el usuario pueda dar consentimiento al registrarse.
    //     No puede aceptarlos sin haberlos podido leer antes.
    //   - Crawlers (Google, etc.) no aceptan login para indexar.
    //   - Linkeo externo: si alguien comparte el link a tus Terms,
    //     debe abrirse, no rebotar a login.
    //
    // /demo y /single/:id las dejamos públicas también porque
    // son demo pages del template original.
    // =====================================================
    useEffect(() => {
        if (!isLogged) {
            const path = location.pathname;
            const isPublic =
                path === "/login" ||
                path === "/register" ||
                path === "/terms" ||
                path === "/privacy" ||
                path === "/legal" ||
                path === "/demo" ||
                // Tanda 7E/7H — el link de reset llega por email SIN
                // sesión (token en query string → path exacto).
                path.startsWith("/reset-password") ||
                path.startsWith("/single/");
            if (!isPublic) {
                navigate("/login", { replace: true });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLogged, location.pathname]);

    // =====================================================
    // LOAD CHAT ROOMS + SOCKET + POLL (fallback)
    // =====================================================
    // Tanda 7F — el evento "chat:message" del socket refresca la lista
    // (y el badge de no leídos) al instante; el intervalo pasa de 15s a
    // 60s y queda solo como red de seguridad si el socket se cae.
    useEffect(() => {
        if (!isLogged) return;
        getChatRooms(dispatch);
        const t = setInterval(() => getChatRooms(dispatch), 60000);

        const socket = getSocket();
        const onChatPing = () => getChatRooms(dispatch);
        if (socket) socket.on("chat:message", onChatPing);

        return () => {
            clearInterval(t);
            if (socket) socket.off("chat:message", onChatPing);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLogged]);

    useEffect(() => {
        if (showMessages && isLogged) getChatRooms(dispatch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showMessages]);

    // Mensajes del hilo abierto — Tanda 7F: el socket avisa de mensajes
    // nuevos de ESTA sala al instante; el poll baja de 4s a 20s (fallback).
    useEffect(() => {
        if (!activeRoom) return;
        let cancelled = false;
        const load = async () => {
            const data = await getRoomMessages(activeRoom.id);
            // null = fallo transitorio → conservamos lo último visible.
            if (!cancelled && data) setMessages(data.messages || []);
        };
        load();
        const t = setInterval(load, 20000);

        const socket = getSocket();
        const onChatPing = (p) => {
            if (p && Number(p.room_id) === Number(activeRoom.id)) load();
        };
        if (socket) socket.on("chat:message", onChatPing);

        return () => {
            cancelled = true;
            clearInterval(t);
            if (socket) socket.off("chat:message", onChatPing);
        };
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
    const handleLogout = async () => {
        // Tanda 7D — pedimos al backend que borre la cookie httpOnly
        // (best-effort: si el server no responde, la sesión local se
        // limpia igual y la cookie huérfana expira sola).
        try {
            await fetch(`${API}/api/logout`, { method: "POST" });
        } catch (_) { /* ignore */ }
        // Tanda 7F — cierra el socket para que el próximo login conecte
        // con la cookie nueva.
        disconnectSocket();
        clearSession();
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
            if (data) setMessages(data.messages || []);
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
        // Compress before sending — keeps a phone photo around ~250 KB.
        let dataUrl;
        try {
            // Tanda 7V — sube a Cloudinary y guarda solo la URL en el
            // mensaje (fallback automático a base64 si la subida falla).
            const { compressAndUpload } = await import("../utils/uploadImage");
            dataUrl = await compressAndUpload(file, "chat");
        } catch (compressErr) {
            console.error("Compression failed, sending raw:", compressErr);
            dataUrl = await fileToDataURL(file);
        }
        try {
            await sendRoomMessage(activeRoom.id, {
                media_url: dataUrl,
                media_type: "image",
            });
            const data = await getRoomMessages(activeRoom.id);
            if (data) setMessages(data.messages || []);
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
                    // Tanda 7V — audio a Cloudinary; fallback base64.
                    const dataUrl = await fileToDataURL(blob);
                    let mediaUrl = dataUrl;
                    try {
                        const { uploadMedia } = await import("../utils/uploadImage");
                        mediaUrl = await uploadMedia(dataUrl, "audio");
                    } catch (_) { /* fallback base64 */ }
                    await sendRoomMessage(activeRoom.id, {
                        media_url: mediaUrl,
                        media_type: "audio",
                    });
                    const data = await getRoomMessages(activeRoom.id);
                    if (data) setMessages(data.messages || []);
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
            if (data) setMessages(data.messages || []);
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

    // Map filter state (read from the store so navbar + Mapview stay in sync)
    const filterDays       = store.mapFilterDays       ?? null;
    const filterVisibility = store.mapFilterVisibility ?? "all";
    const filterStatus     = store.mapFilterStatus     ?? "all";
    const activeFilterCount = countActiveFilters(filterDays, filterVisibility, filterStatus);

    return (
        <>
            <style>{NAVBAR_CSS}</style>

            <NavbarBs variant="dark" className="sq-navbar px-3 py-2 fixed-top">
                <Container fluid className="d-flex justify-content-between align-items-center">

                    <div className="d-flex align-items-center gap-2">
                        <Link to="/app" className="text-decoration-none">
                            <NavbarBs.Brand className="fw-bold fs-3 mb-0">
                                <img src="/logoSideQuest.png" alt="SideQuest" style={{ filter: "brightness(0) invert(1)", height: "32px", width:"auto" }} />
                            </NavbarBs.Brand>
                        </Link>

                        {/* MAP EVENT FILTER — small funnel button next to the logo.
                            Only meaningful when logged in. The dropdown groups three
                            independent filter dimensions (Time / Visibility / Status).
                            Selecting an option dispatches a single action and the
                            map re-renders immediately. `autoClose="outside"` lets
                            the user pick options from several sections in one go. */}
                        {isLogged && (
                            <Dropdown align="start" autoClose="outside">
                                <Dropdown.Toggle
                                    as={Button}
                                    variant="dark"
                                    className="sq-filter-toggle position-relative border-0 p-1"
                                    title="Filter events on the map"
                                    aria-label="Filter events on the map"
                                >
                                    <FiFilter size={20} color="white" aria-hidden="true" />
                                    {activeFilterCount > 0 && (
                                        <Badge pill className="sq-filter-badge ms-1">
                                            {activeFilterCount}
                                        </Badge>
                                    )}
                                </Dropdown.Toggle>

                                <Dropdown.Menu className="sq-filter-dropdown">
                                    {/* ── TIME ── */}
                                    <Dropdown.Header>Time</Dropdown.Header>
                                    {MAP_FILTER_TIME_OPTIONS.map((opt) => {
                                        const isActive = (filterDays ?? null) === opt.value;
                                        return (
                                            <Dropdown.Item
                                                key={`t-${String(opt.value)}`}
                                                active={isActive}
                                                onClick={() => dispatch({ type: "set_map_filter_days", payload: opt.value })}
                                            >
                                                {isActive
                                                    ? <FiCheck className="me-2" />
                                                    : <span className="me-2" style={{ display: "inline-block", width: 14 }} />}
                                                {opt.label}
                                            </Dropdown.Item>
                                        );
                                    })}

                                    <Dropdown.Divider />

                                    {/* ── VISIBILITY ── */}
                                    <Dropdown.Header>Visibility</Dropdown.Header>
                                    {MAP_FILTER_VISIBILITY_OPTIONS.map((opt) => {
                                        const isActive = filterVisibility === opt.value;
                                        return (
                                            <Dropdown.Item
                                                key={`v-${opt.value}`}
                                                active={isActive}
                                                onClick={() => dispatch({ type: "set_map_filter_visibility", payload: opt.value })}
                                            >
                                                {isActive
                                                    ? <FiCheck className="me-2" />
                                                    : <span className="me-2" style={{ display: "inline-block", width: 14 }} />}
                                                <span className="me-2">{opt.icon}</span>
                                                {opt.label}
                                            </Dropdown.Item>
                                        );
                                    })}

                                    <Dropdown.Divider />

                                    {/* ── STATUS ── */}
                                    <Dropdown.Header>My status</Dropdown.Header>
                                    {MAP_FILTER_STATUS_OPTIONS.map((opt) => {
                                        const isActive = filterStatus === opt.value;
                                        return (
                                            <Dropdown.Item
                                                key={`s-${opt.value}`}
                                                active={isActive}
                                                onClick={() => dispatch({ type: "set_map_filter_status", payload: opt.value })}
                                            >
                                                {isActive
                                                    ? <FiCheck className="me-2" />
                                                    : <span className="me-2" style={{ display: "inline-block", width: 14 }} />}
                                                <span className="me-2">{opt.icon}</span>
                                                {opt.label}
                                            </Dropdown.Item>
                                        );
                                    })}

                                    {activeFilterCount > 0 && (
                                        <>
                                            <Dropdown.Divider />
                                            <Dropdown.Item
                                                className="sq-filter-reset"
                                                onClick={() => dispatch({ type: "reset_map_filters" })}
                                            >
                                                <FiRotateCcw className="me-2" />
                                                Reset filters
                                            </Dropdown.Item>
                                        </>
                                    )}
                                </Dropdown.Menu>
                            </Dropdown>
                        )}
                    </div>

                    <Nav className="d-flex flex-row align-items-center gap-2 gap-md-3">
                        {isLogged ? (
                            <>
                                <NotificationBell />

                                <Button
                                    variant="dark"
                                    className="position-relative border-0 p-2"
                                    onClick={() => setShowMessages(true)}
                                    title="My messages"
                                    aria-label={`My messages${chatUnread > 0 ? ` (${chatUnread} unread)` : ""}`}
                                >
                                    <FiMail size={24} color="white" aria-hidden="true" />
                                    {chatUnread > 0 && (
                                        <Badge
                                            bg="danger"
                                            pill
                                            className="position-absolute top-0 start-100 translate-middle"
                                            style={{ fontSize: "0.65rem" }}
                                            aria-hidden="true"
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
                                        aria-label="Open user menu"
                                        title="Menu"
                                    >
                                        <FiMenu size={28} color="white" aria-hidden="true" />
                                    </Dropdown.Toggle>

                                    <Dropdown.Menu className="sq-menu-dropdown">
                                        <Dropdown.Header>
                                            {/* RGPD: si por alguna razón no hay
                                                username (no debería pasar, es
                                                obligatorio en registro), caemos
                                                a un guión genérico — JAMÁS al
                                                email. */}
                                            Hi {cachedUser?.username
                                                ? `@${cachedUser.username}`
                                                : "—"}
                                        </Dropdown.Header>
                                        <Dropdown.Divider />

                                        {/* Tanda 7A — Swap con el pill nav: aquí va
                                            "My Profile" (antes "Friends"); el acceso a
                                            Friends baja al pill del ButtonNavbar. El
                                            modal de perfil vive en ButtonNavbar, así
                                            que lo abrimos disparando el evento custom
                                            que ese componente escucha. */}
                                        <Dropdown.Item
                                            onClick={() => {
                                                window.dispatchEvent(new Event(SHOW_PROFILE_EVENT));
                                            }}
                                        >
                                            <FiUser className="me-2" /> My Profile
                                        </Dropdown.Item>

                                        {/* Tanda 4C — Replay del onboarding tour.
                                            Dispara un evento custom que el componente
                                            <Onboarding/> (montado en Layout) escucha
                                            y vuelve a abrir el modal desde el paso 1.
                                            Sin reload, sin tocar localStorage. */}
                                        <Dropdown.Item
                                            onClick={() => {
                                                window.dispatchEvent(new Event(SHOW_ONBOARDING_EVENT));
                                            }}
                                        >
                                            <FiHelpCircle className="me-2" /> Take the tour
                                        </Dropdown.Item>

                                        <Dropdown.Divider />

                                        {/* SUBMENÚ LEGAL — siempre accesible
                                            desde el hamburger menu, incluso en
                                            páginas fullscreen (mapa) donde el
                                            SiteFooter no se renderiza. Obligatorio
                                            por RGPD/LCEN/LSSI. */}
                                        <Dropdown.Header>Legal</Dropdown.Header>
                                        <Dropdown.Item as={Link} to="/terms">
                                            Terms of Service
                                        </Dropdown.Item>
                                        <Dropdown.Item as={Link} to="/privacy">
                                            Privacy Policy
                                        </Dropdown.Item>
                                        <Dropdown.Item as={Link} to="/legal">
                                            Legal Notice
                                        </Dropdown.Item>

                                        <Dropdown.Divider />

                                        <Dropdown.Item
                                            onClick={handleLogout}
                                            className="sq-menu-logout"
                                        >
                                            <FiLogOut className="me-2" /> Log out
                                        </Dropdown.Item>
                                    </Dropdown.Menu>
                                </Dropdown>
                            </>
                        ) : (
                            <>
                                <Link to="/login">
                                    <Button variant="primary" size="sm" className="me-1">
                                        Sign in
                                    </Button>
                                </Link>
                                <Link to="/register">
                                    <Button variant="success" size="sm">
                                        Sign up
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
                                title="Back to list"
                            >
                                <FiArrowLeft />
                            </Button>
                        )}
                        <span className="flex-grow-1">
                            {activeRoom
                                ? getChatLabel(activeRoom, currentUserId)
                                : "Your Chats"}
                        </span>
                        {activeRoom && (
                            <Button
                                size="sm"
                                className="sq-chat-fullscreen-btn"
                                onClick={openInFullscreen}
                                title="Open in fullscreen"
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
                                    placeholder="Search for an event chat or a friend..."
                                    value={searchQ}
                                    onChange={(e) => setSearchQ(e.target.value)}
                                />
                            </InputGroup>

                            {showingSearch ? (
                                <>
                                    <div className="sq-chat-section-title">
                                        Event chats
                                    </div>
                                    {searchResults.event_rooms.length === 0 ? (
                                        <div className="sq-chat-empty-results">
                                            No results
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
                                        Friends
                                    </div>
                                    {searchResults.friends.length === 0 ? (
                                        <div className="sq-chat-empty-results">
                                            No results
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
                                            You have no active chats. Create/join an event or search for a friend to get started.
                                        </p>
                                    ) : (
                                        /* Tanda 7E — scroll interno (barra oculta) a
                                           partir de ~5 chats para que el modal no
                                           crezca sin límite. */
                                        <div className="sq-chat-rooms-scroll">
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
                                        </div>
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
                                        No messages yet. Write the first one.
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
                                    title="Send photo"
                                    disabled={isRecording || !!editingMsgId}
                                >
                                    <FiImage />
                                </Button>
                                <Button
                                    className={`sq-chat-media-btn ${isRecording ? "recording" : ""}`}
                                    onClick={toggleRecording}
                                    title={isRecording ? "Stop and send audio" : "Record audio"}
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
                                            : "Write a message..."
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
                        Close
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
                            {isDm ? "DM" : "Event"}
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
    // RGPD: si no hay username, mostramos un placeholder genérico
    // antes que filtrar el email a la UI.
    const label = u.username ? `@${u.username}` : "(no username)";
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