import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

import useGlobalReducer from "../hooks/useGlobalReducer";

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
} from "react-icons/fi";

// =====================================================
// LOCAL HELPERS (inlined so the navbar is self-contained)
// =====================================================
const API = import.meta.env.VITE_BACKEND_URL;

const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
});

// Retry exponentiel jusqu'a obtenir une vraie reponse HTTP. Absorbe les
// "Failed to fetch" du cold-start backend sans rien afficher a l'utilisateur.
const fetchWithRetry = async (url, options = {}) => {
    let delay = 400;
    for (;;) {
        try {
            const res = await fetch(url, options);
            return res; // on retourne meme les 4xx/5xx (le caller decide)
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

const getEventMessages = async (eventId) => {
    const res = await fetchWithRetry(`${API}/api/events/${eventId}/chat/messages`, {
        headers: authHeaders(),
    });
    if (!res.ok) return { messages: [] };
    return res.json();
};

const sendEventMessage = async (eventId, text) => {
    const res = await fetchWithRetry(`${API}/api/events/${eventId}/chat/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ text }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.msg || "Failed to send message");
    }
    return res.json();
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

/* Carte de chat : style mini-event-card */
.sq-chat-card {
  display: flex; align-items: center; gap: 0.75rem;
  background: #0f111a; border: 1px solid #262a36;
  border-radius: 12px; padding: 0.6rem 0.75rem; margin-bottom: 0.6rem;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.sq-chat-card:hover {
  transform: translateY(-2px);
  border-color: #6366f1;
  box-shadow: 0 6px 16px rgba(99,102,241,0.15);
}
/* Avatar carre arrondi avec image de l'event (ou fallback gradient) */
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
.sq-chat-card-body { flex: 1; min-width: 0; }
.sq-chat-card-row {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
}
.sq-chat-card-title {
  font-weight: 700; color: #fff; font-size: 1rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1; min-width: 0;
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

/* Thread inline */
.sq-chat-thread {
  background: #0f111a; border: 1px solid #262a36; border-radius: 12px;
  height: 280px; overflow-y: auto; padding: 0.75rem;
}
.sq-chat-msg { margin-bottom: 0.6rem; }
.sq-chat-msg .bubble {
  display: inline-block; padding: 0.4rem 0.7rem;
  border-radius: 10px; max-width: 80%;
  background: #1e2230; color: #e9ecef;
}
.sq-chat-msg.mine { text-align: right; }
.sq-chat-msg.mine .bubble {
  background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff;
}
.sq-chat-msg .meta { font-size: 0.72rem; color: #6c757d; }

/* Hamburger dropdown */
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
    if (room?.event_title) return room.event_title;
    const friend = room?.participants?.find((p) => p.id !== currentUserId);
    return friend ? friend.email : "Chat";
};

// Format heure court (HH:MM aujourd'hui, sinon DD/MM)
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

    // selected chat inside the chat modal
    const [activeRoom, setActiveRoom] = useState(null);
    const [messages, setMessages]     = useState([]);
    const [replyText, setReplyText]   = useState("");
    const threadRef = useRef(null);

    // =====================================================
    // REDIRECT : si pas loggue, on force /register (sauf si deja sur /login ou /register)
    // =====================================================
    useEffect(() => {
        if (!isLogged) {
            const path = location.pathname;
            if (path !== "/login" && path !== "/register") {
                navigate("/register", { replace: true });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLogged, location.pathname]);

    // =====================================================
    // LOAD CHAT ROOMS
    // =====================================================
    useEffect(() => {
        if (isLogged) getChatRooms(dispatch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLogged]);

    // refresh quand on ouvre le modal des chats
    useEffect(() => {
        if (showMessages && isLogged) getChatRooms(dispatch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showMessages]);

    // poll messages quand un chat est ouvert
    useEffect(() => {
        if (!activeRoom) return;

        let cancelled = false;
        const load = async () => {
            const data = await getEventMessages(activeRoom.event_id);
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

    // =====================================================
    // LOGOUT
    // =====================================================
    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        dispatch({ type: "logout" });
        navigate("/register", { replace: true });
    };

    // =====================================================
    // CHAT HANDLERS
    // =====================================================
    const openRoom = (room) => {
        setActiveRoom(room);
        setMessages([]);
        setReplyText("");
    };

    const backToList = () => {
        setActiveRoom(null);
        setMessages([]);
        setReplyText("");
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !activeRoom) return;
        try {
            await sendEventMessage(activeRoom.event_id, replyText);
            setReplyText("");
            const data = await getEventMessages(activeRoom.event_id);
            setMessages(data.messages || []);
        } catch (e) {
            console.error("Error sending message:", e);
        }
    };

    const closeChatModal = () => {
        setShowMessages(false);
        backToList();
    };

    // =====================================================
    // RENDER
    // =====================================================
    const chatCount = store.chatRooms?.length || 0;

    return (
        <>
            <style>{NAVBAR_CSS}</style>

            <NavbarBs variant="dark" className="sq-navbar px-3 py-2 fixed-top">
                <Container fluid className="d-flex justify-content-between align-items-center">

                    <Link to="/" className="text-decoration-none">
                        <NavbarBs.Brand className="fw-bold fs-3 mb-0">
                            <img src="src/front/assets/img/logoSideQuest.png" alt="SideQuest" style={{ filter: "brightness(0) invert(1)", height: "40px", width:"auto" }} />

                        </NavbarBs.Brand>
                    </Link>

                    <Nav className="d-flex flex-row align-items-center gap-2 gap-md-3">
                        {isLogged ? (
                            <>
                                <span className="sq-hide-xs">
                                    <NotificationBell />
                                </span>

                                <Button
                                    variant="dark"
                                    className="position-relative border-0 p-2"
                                    onClick={() => setShowMessages(true)}
                                    title="Mes chats"
                                >
                                    <FiMail size={24} color="white" />
                                    {chatCount > 0 && (
                                        <Badge
                                            bg="danger"
                                            pill
                                            className="position-absolute top-0 start-100 translate-middle"
                                            style={{ fontSize: "0.65rem" }}
                                        >
                                            {chatCount}
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
                                            Hola {cachedUser?.email || "—"}
                                        </Dropdown.Header>
                                        <Dropdown.Divider />

                                        <Dropdown.Item as={Link} to="/friends">
                                            <FiUsers className="me-2" /> Friends
                                        </Dropdown.Item>

                                        <Dropdown.Item as={Link} to="/events">
                                            <FiCalendar className="me-2" /> Mis Eventos
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
                            // ─── NON LOGUE : juste Ingresar / Registro ───
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

            {/* =====================================================
                CHAT MODAL : liste des chats d'events + thread inline
            ===================================================== */}
            <Modal
                show={showMessages}
                onHide={closeChatModal}
                centered
                dialogClassName="sq-chat-modal"
            >
                <Modal.Header closeButton closeVariant="white">
                    <Modal.Title className="d-flex align-items-center gap-2">
                        {activeRoom && (
                            <Button
                                variant="dark"
                                size="sm"
                                className="border-0 p-1"
                                onClick={backToList}
                            >
                                <FiArrowLeft />
                            </Button>
                        )}
                        {activeRoom
                            ? getChatLabel(activeRoom, currentUserId)
                            : "Tus Chats"}
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body>
                    {!activeRoom && chatCount === 0 && (
                        <p className="text-muted mb-0">
                            No tienes chats activos. Crea o unete a un evento para empezar.
                        </p>
                    )}

                    {!activeRoom && chatCount > 0 && (
                        <ListGroup variant="flush">
                            {store.chatRooms.map((room) => {
                                const label = getChatLabel(room, currentUserId);
                                const last = room.last_message;
                                return (
                                    <div
                                        key={room.id}
                                        className="sq-chat-card"
                                        onClick={() => openRoom(room)}
                                    >
                                        {room.event_image ? (
                                            <img
                                                src={room.event_image}
                                                alt={label}
                                                className="sq-chat-avatar"
                                                onError={(e) => {
                                                    // si l'image casse, on bascule sur le fallback
                                                    e.currentTarget.style.display = "none";
                                                }}
                                            />
                                        ) : (
                                            <div className="sq-chat-avatar-fallback">
                                                <FiCalendar size={22} />
                                            </div>
                                        )}

                                        <div className="sq-chat-card-body">
                                            <div className="sq-chat-card-row">
                                                <div className="sq-chat-card-title">
                                                    {label}
                                                </div>
                                                {last && (
                                                    <div className="sq-chat-card-time">
                                                        {formatPreviewTime(last.created_at)}
                                                    </div>
                                                )}
                                            </div>
                                            {last ? (
                                                <div className="sq-chat-card-preview" title={last.text}>
                                                    {last.sender_id === currentUserId ? "Tu: " : ""}
                                                    {last.text}
                                                </div>
                                            ) : (
                                                <div className="sq-chat-card-empty">
                                                    No messages yet
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </ListGroup>
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
                                    placeholder="Escribe un mensaje..."
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSendReply();
                                    }}
                                />
                                <Button variant="primary" onClick={handleSendReply}>
                                    <FiSend />
                                </Button>
                            </InputGroup>
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
