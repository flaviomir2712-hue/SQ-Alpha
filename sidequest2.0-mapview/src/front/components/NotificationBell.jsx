// src/front/components/NotificationBell.jsx
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import {
    FiBell,
    FiUser,
    FiCalendar,
    FiUserPlus,
    FiUserCheck,
    FiCheck,
    FiX,
    FiHelpCircle,
    FiCheckCircle,
    FiXCircle,
    FiEdit2,
    FiTrash2,
    FiLogOut,
    FiThumbsUp,
    FiThumbsDown,
    FiClock,
    FiChevronDown,
    FiChevronUp,
} from "react-icons/fi";

// How many notifications the dropdown shows by default. Anything beyond
// is hidden behind a "Show all (N)" footer button that expands inline —
// no separate page, no extra request (we already have the full list
// from useNotifications).
const DEFAULT_VISIBLE = 5;

import { useNotifications } from "../hooks/useNotifications.jsx";

const API_URL = import.meta.env.VITE_BACKEND_URL;

// Tanda 7D — la autenticación viaja en la cookie httpOnly + X-CSRF-TOKEN,
// añadidos por el parche global de fetch (services/auth.js).
const authHeaders = () => ({
    "Content-Type": "application/json",
});

// Tanda 7H — Retry SOLO para GET y con tope (antes: bucle infinito para
// cualquier método — un PUT de accept/RSVP reintentado podía ejecutar la
// acción dos veces, y con el backend caído quedaban bucles zombi).
// Devuelve null si la red falla — los callers chequean `res?.ok`.
const MAX_GET_RETRIES = 3;
const fetchWithRetry = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    const maxRetries = method === "GET" ? MAX_GET_RETRIES : 0;
    let delay = 400;
    for (let attempt = 0; ; attempt++) {
        try { return await fetch(url, opts); }
        catch (_) {
            if (attempt >= maxRetries) return null;
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay * 2, 4000);
        }
    }
};

// =====================================================
// TYPE-CENTRIC METADATA
// Centralises every per-type concern (avatar tint, icon, where to
// navigate, what action buttons to offer). Adding a new notification
// type → add one entry here and one branch in renderMessage. Nothing
// else in the bell needs to change.
// =====================================================
const TYPE_META = {
    friend_request: {
        avatarClass: "friend",
        icon: <FiUser size={18} />,
        // Click → profile of the person who sent the request. Fallback
        // to the friends list page if for some reason the payload is
        // missing from_user_id (defensive).
        navigateTo: (p) => p.from_user_id ? `/friends/${p.from_user_id}` : "/friends",
    },
    friend_accepted: {
        avatarClass: "friend",
        icon: <FiUserCheck size={18} />,
        // Click → profile of the new friend (the addressee who accepted).
        navigateTo: (p) => p.from_user_id ? `/friends/${p.from_user_id}` : "/friends",
    },
    event_invite: {
        avatarClass: "event",
        icon: <FiCalendar size={18} />,
        navigateTo: () => "/events",
    },
    event_public: {
        avatarClass: "event",
        icon: <FiCalendar size={18} />,
        navigateTo: () => "/events",
    },
    event_updated: {
        avatarClass: "event-warn",
        icon: <FiEdit2 size={18} />,
        navigateTo: (p) => p.event_id ? `/map?event=${p.event_id}` : "/events",
    },
    event_cancelled: {
        avatarClass: "event-danger",
        icon: <FiTrash2 size={18} />,
        navigateTo: () => "/events",
    },
    event_removed: {
        avatarClass: "event-danger",
        icon: <FiLogOut size={18} />,
        navigateTo: () => "/events",
    },
    rsvp_changed: {
        avatarClass: "rsvp",
        icon: <FiCheckCircle size={18} />,
        navigateTo: (p) => p.event_id ? `/map?event=${p.event_id}` : "/events",
    },
    invite_suggestion: {
        avatarClass: "suggestion",
        icon: <FiUserPlus size={18} />,
        // Click → profile of the user being suggested, so the creator can
        // see who they're about to invite before approving/refusing.
        navigateTo: (p) => p.suggested_user_id ? `/friends/${p.suggested_user_id}` : "/events",
    },
    suggestion_approved: {
        avatarClass: "rsvp",
        icon: <FiThumbsUp size={18} />,
        navigateTo: () => "/events",
    },
    suggestion_refused: {
        avatarClass: "event-danger",
        icon: <FiThumbsDown size={18} />,
        navigateTo: () => "/events",
    },
    event_reminder: {
        avatarClass: "reminder",
        icon: <FiClock size={18} />,
        navigateTo: (p) => p.event_id ? `/map?event=${p.event_id}` : "/events",
    },
    // Tanda 7B — Pregunta post-evento al creador: "¿pasó como previsto?".
    // Sin respuesta → botones Yes/No. Con payload.response ("yes"/"no")
    // la fila se queda mostrando el resultado, igual que friend_request.
    event_confirmation: {
        avatarClass: "confirm",
        icon: <FiHelpCircle size={18} />,
        navigateTo: () => "/events",
    },
};

const DEFAULT_META = {
    avatarClass: "event",
    icon: <FiBell size={18} />,
    navigateTo: () => null,
};

const metaFor = (n) => TYPE_META[n?.type] || DEFAULT_META;

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
  width: 360px; max-height: 480px;
  overflow-y: auto;
  padding: 0;
}

/* ── FIX bug #2 — Dropdown de notificaciones desborda izquierda ──
   Con <Dropdown align="end"> Bootstrap+Popper alinean el menú a
   la derecha del TOGGLE (la campana). Como la campana está en
   mitad de la navbar y el menú mide 360px, en móvil se extiende
   por la izquierda y se sale del viewport.
   Fix móvil (<576px): forzar position:fixed con left/right 8px,
   asi el menú queda anclado al viewport, no a la campana.
   - transform:none anula el translate3d() de Popper.
   - inset usa shorthand: top/right/bottom/left.
   - max-width:none anula los 360px fijos para que se adapte.
   ───────────────────────────────────────────────────────────── */
@media (max-width: 575.98px) {
  .sq-bell-menu {
    position: fixed !important;
    top: 64px !important;      /* navbar (~56-60px) + 4-8px de aire */
    left: 8px !important;
    right: 8px !important;
    width: auto !important;
    max-width: none !important;
    transform: none !important;
    margin: 0 !important;
    /* Aseguramos que se pinta sobre el resto del contenido */
    z-index: 1050;
  }
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
.sq-bell-avatar.friend       { background: linear-gradient(135deg, #ec4899, #f97316); color: #fff; }
.sq-bell-avatar.event        { background: linear-gradient(135deg, #6366f1, #ec4899); color: #fff; }
.sq-bell-avatar.event-warn   { background: linear-gradient(135deg, #facc15, #f97316); color: #161922; }
.sq-bell-avatar.event-danger { background: linear-gradient(135deg, #ef4444, #b91c1c); color: #fff; }
.sq-bell-avatar.suggestion   { background: linear-gradient(135deg, #facc15, #f97316); color: #fff; }
.sq-bell-avatar.rsvp         { background: linear-gradient(135deg, #22d3ee, #4f46e5); color: #fff; }
.sq-bell-avatar.reminder     { background: linear-gradient(135deg, #6366f1, #22d3ee); color: #fff; }
.sq-bell-avatar.confirm      { background: linear-gradient(135deg, #22c55e, #6366f1); color: #fff; }

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
.sq-bell-btn.going  { color: #22d3ee !important; }
.sq-bell-btn.going:hover  { background: rgba(34,211,238,0.15) !important; color: #fff !important; border-color: #22d3ee !important; }
.sq-bell-btn.maybe  { color: #facc15 !important; }
.sq-bell-btn.maybe:hover  { background: rgba(250,204,21,0.15) !important; color: #fff !important; border-color: #facc15 !important; }
.sq-bell-btn.refuse { color: #ff8a8a !important; }
.sq-bell-btn.refuse:hover { background: #7f1d1d !important; color: #fff !important; border-color: #ef4444 !important; }
.sq-bell-btn.accept { color: #4ade80 !important; }
.sq-bell-btn.accept:hover { background: #14532d !important; color: #fff !important; border-color: #22c55e !important; }
.sq-bell-btn.plain:hover  { background: #262a36 !important; color: #fff !important; }

.sq-bell-close {
  background: transparent !important; border: none !important;
  color: #6c757d !important; padding: 0.1rem 0.3rem !important;
  font-size: 0.85rem;
  margin-left: auto;
}
.sq-bell-close:hover { color: #ff8a8a !important; }

/* Footer at the bottom of the dropdown — toggles between showing the
   first DEFAULT_VISIBLE notifications and the full list. Sticky so it
   stays reachable even after the user scrolls through the expanded
   list inside the dropdown's own max-height. */
.sq-bell-footer {
  position: sticky;
  bottom: 0;
  background: #161922;
  border-top: 1px solid #262a36;
  padding: 0.5rem 0.6rem;
  display: flex;
  justify-content: center;
  z-index: 2;
}
.sq-bell-footer-btn {
  background: transparent !important;
  border: 1px solid #262a36 !important;
  color: #adb5bd !important;
  font-size: 0.78rem !important;
  font-weight: 600;
  padding: 0.3rem 0.85rem !important;
  border-radius: 999px !important;
  display: inline-flex !important;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  justify-content: center;
}
.sq-bell-footer-btn:hover {
  color: #fff !important;
  border-color: #6366f1 !important;
  background: rgba(99,102,241,0.1) !important;
}
.sq-bell-footer-btn:focus { box-shadow: none !important; }
`;

// =====================================================
// MESSAGE RENDERING — one branch per notification type.
// Keep the copy short; the bell row is narrow.
// =====================================================

// Fallback chain para mostrar el "actor" de la notificación.
// Las notificaciones nuevas que crea el backend siempre incluyen
// `*_username`. PERO las notificaciones VIEJAS (creadas antes de
// la migración email→username) tienen `*_email` en el payload.
// Cuando el frontend solo lee `*_username`, esas notificaciones
// caen al fallback genérico "Someone" — lo que el usuario reporta.
//
// Solución sin tocar backend: extraer la parte LOCAL del email
// (antes del "@") como puente. Es mucho menos sensible que el
// email completo (no revela el dominio) y suele coincidir con el
// username que la persona eligió.
//
// Ideal: backend hace una migración para rellenar `*_username`
// en payloads existentes. Mientras, este fallback resuelve el UX.
const localPartOf = (emailLike) => {
    if (!emailLike || typeof emailLike !== "string") return null;
    const at = emailLike.indexOf("@");
    return at > 0 ? emailLike.slice(0, at) : emailLike;
};

const resolveActor = (...candidates) => {
    for (const c of candidates) {
        if (c && typeof c === "string" && c.trim()) return c.trim();
    }
    return null;
};

const renderMessage = (n) => {
    const p = n.payload || {};
    // Sender (quien dispara la notificación)
    const from =
        resolveActor(
            p.from_username,
            p.sender_username,
            // Bridge para payloads legacy:
            localPartOf(p.from_email),
            localPartOf(p.sender_email),
        ) || "A user";

    const title  = p.event_title || "an event";

    // Target / persona afectada (suggested user, responder)
    const target =
        resolveActor(
            p.suggested_username,
            p.responder_username,
            // Bridge para payloads legacy:
            localPartOf(p.suggested_user_email),
            localPartOf(p.responder_email),
        ) || "another user";

    switch (n.type) {
        case "friend_request": {
            // Backend stamps payload.status when the addressee acts on
            // the request, so the row stays in the bell but updates its
            // wording to reflect the outcome. No status → still pending.
            const status = p.status;
            if (status === "accepted") {
                return (<><strong>{from}</strong> is now your friend</>);
            }
            if (status === "refused") {
                return (<>You refused <strong>{from}</strong>'s friend request</>);
            }
            return (<><strong>{from}</strong> sent you a friend request</>);
        }

        case "friend_accepted":
            return (<><strong>{from}</strong> accepted your friend request</>);

        case "event_invite": {
            const when = [p.event_date, p.event_time].filter(Boolean).join(" ");
            return (
                <>
                    <strong>{from}</strong> invited you to "<strong>{title}</strong>"
                    {when ? ` on ${when}` : ""}
                </>
            );
        }

        case "event_public": {
            const when = [p.event_date, p.event_time].filter(Boolean).join(" ");
            return (
                <>
                    <strong>{from}</strong> created a public event "<strong>{title}</strong>"
                    {when ? ` on ${when}` : ""}
                </>
            );
        }

        case "event_updated": {
            const when = [p.event_date, p.event_time].filter(Boolean).join(" ");
            return (
                <>
                    <strong>{from}</strong> updated "<strong>{title}</strong>"
                    {when ? ` — now ${when}` : ""}
                </>
            );
        }

        case "event_cancelled":
            return (<><strong>{from}</strong> cancelled "<strong>{title}</strong>"</>);

        case "event_removed":
            return (<><strong>{from}</strong> removed you from "<strong>{title}</strong>"</>);

        case "rsvp_changed": {
            const r = p.response;
            const verb = r === "going"     ? "is going to"
                       : r === "maybe"     ? "might go to"
                       : r === "not_going" ? "is not going to"
                       : "responded to";
            return (
                <>
                    <strong>{target}</strong> {verb} "<strong>{title}</strong>"
                </>
            );
        }

        case "invite_suggestion":
            return (
                <>
                    <strong>{from}</strong> suggests inviting <strong>{target}</strong>{" "}
                    to "<strong>{title}</strong>"
                </>
            );

        case "suggestion_approved":
            return (
                <>
                    <strong>{from}</strong> approved your suggestion to invite{" "}
                    <strong>{target}</strong> to "<strong>{title}</strong>"
                </>
            );

        case "suggestion_refused":
            return (
                <>
                    <strong>{from}</strong> refused your suggestion to invite{" "}
                    <strong>{target}</strong> to "<strong>{title}</strong>"
                </>
            );

        case "event_reminder": {
            const h = p.hours_until;
            const when = (typeof h === "number")
                ? (h <= 0 ? "is starting now" : h === 1 ? "starts in 1 hour" : `starts in ${h} hours`)
                : "is coming up";
            return (
                <>
                    Reminder: "<strong>{title}</strong>" {when}
                </>
            );
        }

        case "event_confirmation": {
            // Tanda 7B — backend stamps payload.response ("yes"/"no") once
            // the creator answers; the row then shows the outcome instead
            // of the question (same pattern as friend_request.status).
            const r = p.response;
            if (r === "yes") {
                return (<>You confirmed "<strong>{title}</strong>" happened as planned</>);
            }
            if (r === "no") {
                return (<>You marked "<strong>{title}</strong>" as not happened</>);
            }
            return (<>Did "<strong>{title}</strong>" happen as planned?</>);
        }

        default:
            return "You have a new notification";
    }
};

const formatTimeAgo = (iso) => {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "";
    const diff = Math.max(0, (Date.now() - t) / 1000);
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    return `${Math.floor(diff / 86400)} d`;
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

    // Show-all toggle for the footer "Show all (N) / Show less" button.
    // Local UI state only — survives across polls so the user's choice
    // doesn't get reset every time useNotifications refetches.
    const [showAll, setShowAll] = useState(false);

    // Set de notif-ids actualmente en proceso. Evita que un usuario
    // que pulsa rápido un botón de RSVP (going/maybe/not_going) o
    // de aceptar/refusar request mande N requests al backend antes
    // de que llegue la primera respuesta. Es un ref (no state)
    // porque no necesitamos re-render — solo bloquear duplicados.
    const inFlightRef = useRef(new Set());
    const guardInFlight = async (notifId, fn) => {
        if (inFlightRef.current.has(notifId)) return; // ya en proceso
        inFlightRef.current.add(notifId);
        try { await fn(); }
        finally { inFlightRef.current.delete(notifId); }
    };

    // ----- friend_request -----
    // Action handlers MARK the notif as read (not delete) so the user can
    // still scroll back and see "I accepted X's request yesterday". The
    // notification only goes away when the user explicitly clicks the X.
    // The backend mirrors this with _mark_*_read helpers — without that
    // mirror, a re-fetch would resurrect an unread state we just cleared.
    const acceptFriend = async (n) => {
        const fid = (n.payload || {}).friendship_id;
        if (!fid) return;
        const res = await fetchWithRetry(
            `${API_URL}/api/friends/requests/${fid}/accept`,
            { method: "PUT", headers: authHeaders() }
        );
        if (res?.ok) { markAsRead(n.id); fetchNotifications(); }
    };

    const refuseFriend = async (n) => {
        const fid = (n.payload || {}).friendship_id;
        if (!fid) return;
        const res = await fetchWithRetry(
            `${API_URL}/api/friends/requests/${fid}/refuse`,
            { method: "PUT", headers: authHeaders() }
        );
        if (res?.ok) { markAsRead(n.id); fetchNotifications(); }
    };

    // ----- event_invite / event_public (3 buttons via /respond) -----
    const respondEvent = (n, response) =>
        guardInFlight(`evt-${n.id}-${response}`, async () => {
            const eid = (n.payload || {}).event_id;
            if (!eid) return;
            const res = await fetchWithRetry(
                `${API_URL}/api/events/${eid}/respond`,
                {
                    method: "PUT",
                    headers: authHeaders(),
                    body: JSON.stringify({ response }),
                }
            );
            if (res?.ok) { markAsRead(n.id); fetchNotifications(); }
        });

    // ----- invite_suggestion (creator-only actions) -----
    const approveSuggestion = async (n) => {
        const p = n.payload || {};
        if (!p.event_id || !p.suggestion_id) return;
        const res = await fetchWithRetry(
            `${API_URL}/api/events/${p.event_id}/suggestions/${p.suggestion_id}/approve`,
            { method: "PUT", headers: authHeaders() }
        );
        if (res?.ok) { markAsRead(n.id); fetchNotifications(); }
    };

    const refuseSuggestion = async (n) => {
        const p = n.payload || {};
        if (!p.event_id || !p.suggestion_id) return;
        const res = await fetchWithRetry(
            `${API_URL}/api/events/${p.event_id}/suggestions/${p.suggestion_id}/refuse`,
            { method: "PUT", headers: authHeaders() }
        );
        if (res?.ok) { markAsRead(n.id); fetchNotifications(); }
    };

    // ----- event_confirmation (creator answers "did it happen?") -----
    // Tanda 7B — guardInFlight evita doble click; el backend estampa
    // payload.response y marca leída, así el refetch muestra el resultado.
    const confirmEvent = (n, happened) =>
        guardInFlight(`conf-${n.id}`, async () => {
            const eid = (n.payload || {}).event_id;
            if (!eid) return;
            const res = await fetchWithRetry(
                `${API_URL}/api/events/${eid}/confirm`,
                {
                    method: "PUT",
                    headers: authHeaders(),
                    body: JSON.stringify({ happened }),
                }
            );
            if (res?.ok) { fetchNotifications(); }
        });

    // Click anywhere on the row → mark read + navigate (per-type target).
    const handleClickNotif = (n) => {
        if (!n.is_read) markAsRead(n.id);
        const path = metaFor(n).navigateTo(n.payload || {});
        if (path) navigate(path);
    };

    return (
        <>
            <style>{BELL_CSS}</style>

            <Dropdown align="end">
                <Dropdown.Toggle
                    as={Button}
                    className="sq-bell-toggle border-0"
                    title="Notifications"
                >
                    <FiBell size={22} />
                    {unreadCount > 0 && (
                        <Badge
                            bg="danger" pill
                            className="position-absolute top-0 start-100 translate-middle"
                            style={{ fontSize: "0.6rem" }}
                        >
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                    )}
                </Dropdown.Toggle>

                <Dropdown.Menu className="sq-bell-menu">
                    <div className="sq-bell-header">
                        <div className="sq-bell-title">Your notifications</div>
                        {unreadCount > 0 && (
                            <Button
                                size="sm"
                                className="sq-bell-mark-all"
                                onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                            >
                                Mark all
                            </Button>
                        )}
                    </div>

                    {(notifications || []).length === 0 ? (
                        <div className="sq-bell-empty">You have no notifications</div>
                    ) : (
                        // Collapsed by default to DEFAULT_VISIBLE, expanded to
                        // the full list when the user clicks the footer button.
                        ((showAll ? (notifications || []) : (notifications || []).slice(0, DEFAULT_VISIBLE))).map((n) => {
                            const meta = metaFor(n);
                            // A friend_request notif with payload.status set has
                            // already been accepted/refused — no more buttons,
                            // just the updated label rendered by renderMessage.
                            const friendReqStatus = n.type === "friend_request"
                                ? (n.payload || {}).status
                                : null;
                            const isFriendReq  = n.type === "friend_request" && !friendReqStatus;
                            const isEventInv   = n.type === "event_invite" || n.type === "event_public";
                            const isSuggestion = n.type === "invite_suggestion";
                            // Tanda 7B — pregunta de confirmación aún sin
                            // responder (payload.response ausente).
                            const isConfirmation =
                                n.type === "event_confirmation" && !(n.payload || {}).response;

                            return (
                                <div
                                    key={n.id}
                                    className={`sq-bell-item ${n.is_read ? "" : "unread"}`}
                                    onClick={() => handleClickNotif(n)}
                                >
                                    <div className={`sq-bell-avatar ${meta.avatarClass}`}>
                                        {meta.icon}
                                    </div>

                                    <div className="sq-bell-body">
                                        <div className="sq-bell-row1">
                                            <div className="sq-bell-msg">{renderMessage(n)}</div>
                                            <div className="sq-bell-time">{formatTimeAgo(n.created_at)}</div>
                                        </div>

                                        <div className="sq-bell-actions">
                                            {isFriendReq && (
                                                <>
                                                    <Button size="sm" className="sq-bell-btn accept"
                                                        onClick={(e) => { e.stopPropagation(); acceptFriend(n); }}>
                                                        <FiCheck /> Accept
                                                    </Button>
                                                    <Button size="sm" className="sq-bell-btn refuse"
                                                        onClick={(e) => { e.stopPropagation(); refuseFriend(n); }}>
                                                        <FiX /> Refuse
                                                    </Button>
                                                </>
                                            )}

                                            {isEventInv && (
                                                <>
                                                    <Button size="sm" className="sq-bell-btn going"
                                                        onClick={(e) => { e.stopPropagation(); respondEvent(n, "going"); }}
                                                        title="Going">
                                                        <FiCheckCircle /> Going
                                                    </Button>
                                                    <Button size="sm" className="sq-bell-btn maybe"
                                                        onClick={(e) => { e.stopPropagation(); respondEvent(n, "maybe"); }}
                                                        title="Maybe">
                                                        <FiHelpCircle /> Maybe
                                                    </Button>
                                                    <Button size="sm" className="sq-bell-btn refuse"
                                                        onClick={(e) => { e.stopPropagation(); respondEvent(n, "not_going"); }}
                                                        title="Not going">
                                                        <FiXCircle /> Not going
                                                    </Button>
                                                </>
                                            )}

                                            {isSuggestion && (
                                                <>
                                                    <Button size="sm" className="sq-bell-btn accept"
                                                        onClick={(e) => { e.stopPropagation(); approveSuggestion(n); }}>
                                                        <FiCheck /> Approve
                                                    </Button>
                                                    <Button size="sm" className="sq-bell-btn refuse"
                                                        onClick={(e) => { e.stopPropagation(); refuseSuggestion(n); }}>
                                                        <FiX /> Refuse
                                                    </Button>
                                                </>
                                            )}

                                            {isConfirmation && (
                                                <>
                                                    <Button size="sm" className="sq-bell-btn accept"
                                                        onClick={(e) => { e.stopPropagation(); confirmEvent(n, true); }}>
                                                        <FiThumbsUp /> Yes, it happened
                                                    </Button>
                                                    <Button size="sm" className="sq-bell-btn refuse"
                                                        onClick={(e) => { e.stopPropagation(); confirmEvent(n, false); }}>
                                                        <FiThumbsDown /> No, it didn't
                                                    </Button>
                                                </>
                                            )}

                                            {!n.is_read && (
                                                <Button size="sm" className="sq-bell-btn plain"
                                                    title="Mark as read"
                                                    onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}>
                                                    <FiCheckCircle />
                                                </Button>
                                            )}
                                            <Button size="sm" className="sq-bell-close" title="Delete"
                                                onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}>
                                                <FiX />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Show all / Show less footer — only rendered when the
                        user actually has more than DEFAULT_VISIBLE notifs.
                        Sticky bottom inside the dropdown's scroll area so
                        the user can collapse without scrolling back up. */}
                    {(notifications || []).length > DEFAULT_VISIBLE && (
                        <div className="sq-bell-footer">
                            <Button
                                className="sq-bell-footer-btn"
                                onClick={(e) => { e.stopPropagation(); setShowAll((v) => !v); }}
                            >
                                {showAll
                                    ? (<><FiChevronUp /> Show less</>)
                                    : (<><FiChevronDown /> Show all ({(notifications || []).length})</>)}
                            </Button>
                        </div>
                    )}
                </Dropdown.Menu>
            </Dropdown>
        </>
    );
};