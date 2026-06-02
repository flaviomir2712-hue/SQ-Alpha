// src/front/components/NotificationBell.jsx
import { useNavigate } from "react-router-dom";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import {
    FiBell,
    FiUser,
    FiCalendar,
    FiCheck,
    FiX,
    FiCheckCircle,
} from "react-icons/fi";

import { useNotifications } from "../hooks/useNotifications.jsx";

const API_URL = import.meta.env.VITE_BACKEND_URL;

const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const fetchWithRetry = async (url, opts = {}) => {
    let delay = 400;
    for (;;) {
        try {
            return await fetch(url, opts);
        } catch (_) {
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay * 2, 4000);
        }
    }
};

// =====================================================
// STYLES (dark, coherent avec Navbar / EventModal)
// =====================================================
const BELL_CSS = `
.sq-bell-toggle.dropdown-toggle::after { display: none; }
.sq-bell-toggle {
  background: transparent !important; border: none !important;
  color: #fff !important; padding: 0.25rem 0.5rem;
  position: relative;
}
.sq-bell-toggle:focus { box-shadow: none !important; }

.sq-bell-menu {
  background: #161922; border: 1px solid #262a36;
  color: #e9ecef;
  width: 340px; max-height: 460px;
  overflow-y: auto;
  padding: 0;
}
.sq-bell-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid #262a36;
  position: sticky; top: 0; background: #161922; z-index: 2;
}
.sq-bell-title { font-weight: 700; color: #fff; font-size: 0.95rem; }
.sq-bell-mark-all {
  background: transparent !important; border: 1px solid #262a36 !important;
  color: #adb5bd !important; font-size: 0.7rem !important;
  padding: 0.2rem 0.55rem !important;
}
.sq-bell-mark-all:hover { color: #fff !important; border-color: #6366f1 !important; }

.sq-bell-empty {
  color: #6c757d; font-style: italic; font-size: 0.9rem;
  text-align: center; padding: 2rem 1rem;
}

.sq-bell-item {
  display: flex; gap: 0.6rem;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #262a36;
  cursor: pointer;
  transition: background 0.12s ease;
  position: relative;
}
.sq-bell-item:hover { background: #1e2230; }
.sq-bell-item.unread { background: rgba(99,102,241,0.06); }
.sq-bell-item.unread::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; background: #6366f1;
}

.sq-bell-avatar {
  width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #262a36;
}
.sq-bell-avatar.friend { background: linear-gradient(135deg, #ec4899, #f97316); color: #fff; }
.sq-bell-avatar.event  { background: linear-gradient(135deg, #6366f1, #ec4899); color: #fff; }

.sq-bell-body { flex: 1; min-width: 0; }
.sq-bell-row1 {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 0.5rem;
}
.sq-bell-msg {
  font-size: 0.86rem; color: #e9ecef; line-height: 1.3;
  white-space: normal; word-break: break-word;
}
.sq-bell-msg strong { color: #fff; }
.sq-bell-time {
  font-size: 0.68rem; color: #6c757d; flex-shrink: 0;
}
.sq-bell-actions {
  display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem;
}
.sq-bell-btn {
  background: #1e2230 !important; color: #adb5bd !important;
  border: 1px solid #262a36 !important;
  font-size: 0.72rem !important;
  padding: 0.18rem 0.55rem !important;
  display: inline-flex !important; align-items: center; gap: 0.25rem;
}
.sq-bell-btn.accept { color: #4ade80 !important; }
.sq-bell-btn.accept:hover { background: #14532d !important; color: #fff !important; border-color: #22c55e !important; }
.sq-bell-btn.refuse { color: #ff8a8a !important; }
.sq-bell-btn.refuse:hover { background: #7f1d1d !important; color: #fff !important; border-color: #ef4444 !important; }
.sq-bell-btn.plain:hover { background: #262a36 !important; color: #fff !important; }

.sq-bell-close {
  background: transparent !important; border: none !important;
  color: #6c757d !important; padding: 0.1rem 0.3rem !important;
  font-size: 0.85rem;
  margin-left: auto;
}
.sq-bell-close:hover { color: #ff8a8a !important; }
`;

// =====================================================
// HELPERS
// =====================================================
const renderMessage = (n) => {
    const p = n.payload || {};
    const from = p.from_email || "Alguien";
    if (n.type === "friend_request") {
        return (
            <>
                <strong>{from}</strong> te envió una solicitud de amistad
            </>
        );
    }
    if (n.type === "event_invite") {
        const title = p.event_title || "un evento";
        const when = [p.event_date, p.event_time].filter(Boolean).join(" ");
        return (
            <>
                <strong>{from}</strong> te invitó a "<strong>{title}</strong>"
                {when ? ` el ${when}` : ""}
            </>
        );
    }
    return "Tienes una notificación nueva";
};

const formatTimeAgo = (iso) => {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "";
    const diffSec = Math.max(0, (Date.now() - t) / 1000);
    if (diffSec < 60) return "ahora";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h`;
    return `${Math.floor(diffSec / 86400)} d`;
};

// =====================================================
// COMPONENT
// =====================================================
export const NotificationBell = () => {
    const navigate = useNavigate();
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllRead,
        deleteNotification,
        fetchNotifications,
    } = useNotifications({ poll: true });

    // Accept / refuse a friend_request via the existing /api/friends endpoints.
    // Backend deletes the notif server-side; we drop it from local state too.
    const acceptFriend = async (n) => {
        const fid = (n.payload || {}).friendship_id;
        if (!fid) return;
        const res = await fetchWithRetry(
            `${API_URL}/api/friends/requests/${fid}/accept`,
            { method: "PUT", headers: authHeaders() }
        );
        if (res.ok) {
            deleteNotification(n.id);
            fetchNotifications();
        }
    };

    const refuseFriend = async (n) => {
        const fid = (n.payload || {}).friendship_id;
        if (!fid) return;
        const res = await fetchWithRetry(
            `${API_URL}/api/friends/requests/${fid}/refuse`,
            { method: "PUT", headers: authHeaders() }
        );
        if (res.ok) {
            deleteNotification(n.id);
            fetchNotifications();
        }
    };

    // Accept / refuse an event_invite via the new /api/events/<id>/(accept|refuse).
    // Same pattern: server-side cleanup + local mirror.
    const acceptEvent = async (n) => {
        const eid = (n.payload || {}).event_id;
        if (!eid) return;
        const res = await fetchWithRetry(
            `${API_URL}/api/events/${eid}/accept`,
            { method: "PUT", headers: authHeaders() }
        );
        if (res.ok) {
            deleteNotification(n.id);
            fetchNotifications();
        }
    };

    const refuseEvent = async (n) => {
        const eid = (n.payload || {}).event_id;
        if (!eid) return;
        const res = await fetchWithRetry(
            `${API_URL}/api/events/${eid}/refuse`,
            { method: "PUT", headers: authHeaders() }
        );
        if (res.ok) {
            deleteNotification(n.id);
            fetchNotifications();
        }
    };

    const handleClickNotif = (n) => {
        if (!n.is_read) markAsRead(n.id);
        if (n.type === "event_invite") navigate("/events");
        else if (n.type === "friend_request") navigate("/friends");
    };

    return (
        <>
            <style>{BELL_CSS}</style>

            <Dropdown align="end">
                <Dropdown.Toggle
                    as={Button}
                    className="sq-bell-toggle border-0"
                    title="Notificaciones"
                >
                    <FiBell size={22} />
                    {unreadCount > 0 && (
                        <Badge
                            bg="danger"
                            pill
                            className="position-absolute top-0 start-100 translate-middle"
                            style={{ fontSize: "0.6rem" }}
                        >
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                    )}
                </Dropdown.Toggle>

                <Dropdown.Menu className="sq-bell-menu">
                    <div className="sq-bell-header">
                        <div className="sq-bell-title">Tus Notificaciones</div>
                        {unreadCount > 0 && (
                            <Button
                                size="sm"
                                className="sq-bell-mark-all"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    markAllRead();
                                }}
                            >
                                Marcar todas
                            </Button>
                        )}
                    </div>

                    {(notifications || []).length === 0 ? (
                        <div className="sq-bell-empty">No tienes notificaciones</div>
                    ) : (
                        notifications.map((n) => {
                            const isFriend = n.type === "friend_request";
                            const isEvent  = n.type === "event_invite";
                            return (
                                <div
                                    key={n.id}
                                    className={`sq-bell-item ${n.is_read ? "" : "unread"}`}
                                    onClick={() => handleClickNotif(n)}
                                >
                                    <div className={`sq-bell-avatar ${isFriend ? "friend" : "event"}`}>
                                        {isFriend ? <FiUser size={18} /> : <FiCalendar size={18} />}
                                    </div>

                                    <div className="sq-bell-body">
                                        <div className="sq-bell-row1">
                                            <div className="sq-bell-msg">
                                                {renderMessage(n)}
                                            </div>
                                            <div className="sq-bell-time">
                                                {formatTimeAgo(n.created_at)}
                                            </div>
                                        </div>

                                        <div className="sq-bell-actions">
                                            {isFriend && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        className="sq-bell-btn accept"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            acceptFriend(n);
                                                        }}
                                                    >
                                                        <FiCheck /> Aceptar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="sq-bell-btn refuse"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            refuseFriend(n);
                                                        }}
                                                    >
                                                        <FiX /> Rechazar
                                                    </Button>
                                                </>
                                            )}
                                            {isEvent && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        className="sq-bell-btn accept"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            acceptEvent(n);
                                                        }}
                                                    >
                                                        <FiCheck /> Aceptar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="sq-bell-btn refuse"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            refuseEvent(n);
                                                        }}
                                                    >
                                                        <FiX /> Rechazar
                                                    </Button>
                                                </>
                                            )}
                                            {!n.is_read && (
                                                <Button
                                                    size="sm"
                                                    className="sq-bell-btn plain"
                                                    title="Marcar como leída"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        markAsRead(n.id);
                                                    }}
                                                >
                                                    <FiCheckCircle />
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                className="sq-bell-close"
                                                title="Eliminar"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteNotification(n.id);
                                                }}
                                            >
                                                <FiX />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </Dropdown.Menu>
            </Dropdown>
        </>
    );
};
