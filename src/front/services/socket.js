// src/front/services/socket.js
//
// Tanda 7F — Cliente Socket.IO (singleton).
//
// La autenticación del handshake es la cookie httpOnly sq_access_token
// (Tanda 7D): withCredentials hace que el navegador la adjunte solo.
// Si no hay sesión, getSocket() devuelve null y los consumidores
// simplemente no se suscriben (su polling de fallback sigue activo).
//
// Eventos que emite el backend a la sala personal user_<id>:
//   "notification:new"  {type}     → refetch de /notifications
//   "chat:message"      {room_id}  → refetch de rooms / mensajes
//
// Patrón ping→refetch: el socket solo AVISA; los datos siempre se piden
// por la API REST normal. Una única fuente de verdad.

import { io } from "socket.io-client";
import { isLoggedIn } from "./auth";

const BASE = import.meta.env.VITE_BACKEND_URL || "";

let socket = null;

export const getSocket = () => {
  if (!isLoggedIn() || !BASE) return null;
  if (socket) return socket;
  socket = io(BASE, {
    // Adjunta la cookie httpOnly en el handshake (polling y upgrade).
    withCredentials: true,
    // Intenta WebSocket primero; si el proxy/worker no lo soporta,
    // socket.io cae a long-polling automáticamente.
    transports: ["websocket", "polling"],
  });
  return socket;
};

// Llamar en el logout: cierra la conexión y olvida el singleton para
// que el siguiente login cree una conexión con la cookie nueva.
export const disconnectSocket = () => {
  if (socket) {
    try { socket.disconnect(); } catch (_) { /* ignore */ }
    socket = null;
  }
};

// ─────────────────────────────────────────────────────────────
// Tanda 7F2 — evento DOM local "los eventos cambiaron".
//
// Complemento del ping "event:changed" del socket: cuando ESTE mismo
// navegador crea/edita un evento desde un modal que no vive en el mapa
// (p. ej. el "+" del pill nav, cuyo EventModal está en ButtonNavbar),
// se dispara este evento de window y Mapview refetchea al instante —
// garantizado incluso si el socket está caído. Mismo patrón
// bump-and-listen que SHOW_PROFILE_EVENT / SHOW_ONBOARDING_EVENT.
export const EVENTS_CHANGED_EVENT = "sq:events-changed";

export const announceEventsChanged = () => {
  try {
    window.dispatchEvent(new Event(EVENTS_CHANGED_EVENT));
  } catch (_) { /* SSR/tests: sin window, sin problema */ }
};
