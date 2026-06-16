// src/front/hooks/useNotifications.jsx
//
// Centralises every notification-related side-effect: fetch list, fetch
// unread count, mark one/all as read, delete. Also exposes a `start()`
// helper that kicks an interval-based polling loop so the bell stays
// up-to-date while the user navigates.
//
// The hook reads from / writes to the global reducer so all components
// (NotificationBell, future modals, etc.) see the same data.

import { useEffect, useRef } from "react";
import useGlobalReducer from "./useGlobalReducer.jsx";
// Tanda 7D — la sesión vive en una cookie httpOnly; el guard de
// "¿estoy logueado?" pasa a basarse en el user persistido.
import { isLoggedIn } from "../services/auth";
// Tanda 7F — el socket avisa al instante; el polling queda de fallback.
import { getSocket } from "../services/socket";

const API_URL = import.meta.env.VITE_BACKEND_URL;
// Tanda 7F — antes 20s: ahora el evento "notification:new" del socket
// refresca al instante y este intervalo es solo red de seguridad
// (socket caído, transacción aún sin commit al llegar el ping, etc.).
const POLL_MS = 60000;

// Tanda 7D — la autenticación viaja en la cookie httpOnly + X-CSRF-TOKEN,
// añadidos por el parche global de fetch (services/auth.js).
const authHeaders = () => ({
    "Content-Type": "application/json",
});

// Retry exponentiel jusqu'a obtenir une vraie reponse HTTP. Absorbe les
// "Failed to fetch" du cold-start backend sans rien afficher a l'utilisateur.
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

export const useNotifications = ({ poll = false } = {}) => {
    const { store, dispatch } = useGlobalReducer();
    const intervalRef = useRef(null);

    const fetchNotifications = async () => {
        if (!isLoggedIn()) return;
        const res = await fetchWithRetry(`${API_URL}/api/notifications`, {
            headers: authHeaders(),
        });
        if (!res?.ok) return;
        const data = await res.json();
        dispatch({ type: "set_notifications", payload: data });
    };

    const fetchUnreadCount = async () => {
        if (!isLoggedIn()) return;
        const res = await fetchWithRetry(`${API_URL}/api/notifications/unread-count`, {
            headers: authHeaders(),
        });
        if (!res?.ok) return;
        const data = await res.json();
        dispatch({ type: "set_unread_notifs_count", payload: data.unread_count });
    };

    const markAsRead = async (id) => {
        const res = await fetchWithRetry(`${API_URL}/api/notifications/${id}/read`, {
            method: "PUT",
            headers: authHeaders(),
        });
        if (res?.ok) dispatch({ type: "mark_notification_read", payload: id });
    };

    const markAllRead = async () => {
        const res = await fetchWithRetry(`${API_URL}/api/notifications/read-all`, {
            method: "PUT",
            headers: authHeaders(),
        });
        if (res?.ok) dispatch({ type: "mark_all_notifications_read" });
    };

    const deleteNotification = async (id) => {
        const res = await fetchWithRetry(`${API_URL}/api/notifications/${id}`, {
            method: "DELETE",
            headers: authHeaders(),
        });
        if (res?.ok) dispatch({ type: "remove_notification", payload: id });
    };

    // Optional polling — opt-in via { poll: true }. Used by NotificationBell so
    // a single mounted bell keeps the global count fresh; other consumers can
    // omit it and just call fetchNotifications() on demand.
    useEffect(() => {
        if (!poll) return;
        if (!isLoggedIn()) return;

        // initial load
        fetchNotifications();

        intervalRef.current = setInterval(() => {
            fetchNotifications();
        }, POLL_MS);

        // Tanda 7F — tiempo real: el backend emite "notification:new" a
        // la sala user_<id> cada vez que crea una notificación (único
        // punto de emisión en _create_notification). Al recibirlo,
        // refetcheamos — la campana se actualiza al instante.
        const socket = getSocket();
        const onNotifPing = () => fetchNotifications();
        if (socket) socket.on("notification:new", onNotifPing);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (socket) socket.off("notification:new", onNotifPing);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [poll]);

    return {
        notifications:     store.notifications || [],
        unreadCount:       store.unreadNotifsCount || 0,
        fetchNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllRead,
        deleteNotification,
    };
};

export default useNotifications;
