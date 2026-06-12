import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../services/api";
// Tanda 7F — el socket avisa de mensajes nuevos al instante; el polling
// queda solo como red de seguridad.
import { getSocket } from "../services/socket";

// Tanda 7F — antes 3s: el evento "chat:message" del socket refresca al
// instante y este intervalo es solo fallback (socket caído, etc.).
const POLL_INTERVAL = 15000;

/**
 * Hook para gestionar UNA sala de chat abierta.
 * Usa los endpoints reales /chat/rooms/<id>/messages.
 *
 * sendMessage acepta:
 *   - sendMessage("hola")
 *   - sendMessage({ text: "hola" })
 *   - sendMessage({ media_url: "data:...", media_type: "image" })
 *   - sendMessage({ media_url: "data:...", media_type: "audio" })
 */
export const useChat = (roomId) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const lastIdRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    try {
      const data = await api.get(`/chat/rooms/${roomId}/messages`);
      const list = data.messages || [];
      setMessages(list);
      if (list.length) lastIdRef.current = list[list.length - 1].id;
    } catch (e) { console.error("fetchMessages:", e); }
  }, [roomId]);

  const sendMessage = useCallback(async (input) => {
    if (!roomId || !input) return;
    const body = typeof input === "string" ? { text: input } : { ...input };
    if (body.text) body.text = body.text.trim();
    if (!body.text && !body.media_url) return;

    setSending(true);
    const me = JSON.parse(localStorage.getItem("user") || "{}");
    const optimistic = {
      id: `tmp-${Date.now()}`,
      room_id: roomId,
      sender_id: me?.id,
      sender_username: me?.username,
      text: body.text || null,
      media_url: body.media_url || null,
      media_type: body.media_type || null,
      deleted: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      _optimistic: true,
    };
    setMessages((p) => [...p, optimistic]);

    try {
      const resp = await api.post(`/chat/rooms/${roomId}/messages`, body);
      const saved = resp.message;
      setMessages((p) => p.map((m) => (m.id === optimistic.id ? saved : m)));
    } catch (e) {
      setMessages((p) =>
        p.map((m) => (m.id === optimistic.id ? { ...m, _failed: true } : m))
      );
      console.error("sendMessage:", e);
    } finally {
      setSending(false);
    }
  }, [roomId]);

  const editMessage = useCallback(async (msgId, newText) => {
    if (!roomId || !msgId || !newText?.trim()) return;
    setMessages((p) => p.map((m) =>
      m.id === msgId
        ? { ...m, text: newText, edited_at: new Date().toISOString() }
        : m
    ));
    try {
      const resp = await api.put(`/chat/rooms/${roomId}/messages/${msgId}`, { text: newText });
      const saved = resp.message;
      setMessages((p) => p.map((m) => (m.id === msgId ? saved : m)));
    } catch (e) {
      console.error("editMessage:", e);
      fetchMessages();
    }
  }, [roomId, fetchMessages]);

  const deleteMessage = useCallback(async (msgId) => {
    if (!roomId || !msgId) return;
    setMessages((p) => p.map((m) =>
      m.id === msgId
        ? { ...m, deleted: true, text: null, media_url: null, media_type: null }
        : m
    ));
    try {
      await api.del(`/chat/rooms/${roomId}/messages/${msgId}`);
    } catch (e) {
      console.error("deleteMessage:", e);
      fetchMessages();
    }
  }, [roomId, fetchMessages]);

  const markRead = useCallback(async () => {
    if (!roomId) return;
    try { await api.put(`/chat/rooms/${roomId}/read`); } catch (_) { /* best-effort */ }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
    markRead();
    const id = setInterval(fetchMessages, POLL_INTERVAL);

    // Tanda 7F — tiempo real: si el ping es de ESTA sala, refetch
    // inmediato + markRead (estamos con el hilo abierto, el mensaje
    // queda leído al instante y el badge global no parpadea).
    const socket = getSocket();
    const onChatPing = (p) => {
      if (p && Number(p.room_id) === Number(roomId)) {
        fetchMessages();
        markRead();
      }
    };
    if (socket) socket.on("chat:message", onChatPing);

    return () => {
      clearInterval(id);
      if (socket) socket.off("chat:message", onChatPing);
    };
  }, [roomId, fetchMessages, markRead]);

  return {
    messages, loading, sending,
    sendMessage, editMessage, deleteMessage,
    refetch: fetchMessages, markRead,
  };
};