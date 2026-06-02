export const initialStore = () => {
  return {
    message: null,
    user: null,
    todos: [
      { id: 1, title: "Make the bed", background: null },
      { id: 2, title: "Do my homework", background: null },
    ],

    // ── Chat (navbar) ──────────────────────────────
    // chatRooms contains both event-rooms and dm-rooms.
    // chatUnreadTotal is the sum of unread_count across every room.
    chatRooms: [],
    chatUnreadTotal: 0,

    // ── Friends ────────────────────────────────────
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],

    // ── Notifications ──────────────────────────────
    notifications: [],
    unreadNotifsCount: 0,
  };
};

// Sum the unread_count across every room — used to drive the navbar badge.
const sumUnread = (rooms) =>
  (rooms || []).reduce((sum, r) => sum + (r.unread_count || 0), 0);

export default function storeReducer(store, action = {}) {
  switch (action.type) {
    // ── existing ──────────────────────────────────
    case "set_hello":
      return { ...store, message: action.payload };

    case "add_task": {
      const { id, color } = action.payload;
      return {
        ...store,
        todos: store.todos.map((todo) =>
          todo.id === id ? { ...todo, background: color } : todo
        ),
      };
    }

    // ── auth / navbar ─────────────────────────────
    case "set_user":
      return { ...store, user: action.payload };

    case "set_chat_rooms": {
      const rooms = action.payload || [];
      return { ...store, chatRooms: rooms, chatUnreadTotal: sumUnread(rooms) };
    }

    case "set_chat_unread_total":
      return { ...store, chatUnreadTotal: action.payload || 0 };

    // Optimistically clear unread on a single room (used right after
    // PUT /chat/rooms/<id>/read fires) so the badge reacts instantly.
    case "mark_room_read_local": {
      const roomId = action.payload;
      const rooms = (store.chatRooms || []).map((r) =>
        r.id === roomId ? { ...r, unread_count: 0 } : r
      );
      return { ...store, chatRooms: rooms, chatUnreadTotal: sumUnread(rooms) };
    }

    // Insert (or replace) a single room — used right after POST /api/chat/dm
    // creates or returns an existing 1-on-1 room.
    case "upsert_chat_room": {
      const room = action.payload;
      if (!room) return store;
      const idx = (store.chatRooms || []).findIndex((r) => r.id === room.id);
      let next;
      if (idx === -1) {
        next = [room, ...(store.chatRooms || [])];
      } else {
        next = [...store.chatRooms];
        next[idx] = room;
      }
      return { ...store, chatRooms: next, chatUnreadTotal: sumUnread(next) };
    }

    case "logout":
      return {
        ...store,
        user: null,
        chatRooms: [],
        chatUnreadTotal: 0,
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
        notifications: [],
        unreadNotifsCount: 0,
      };

    // ── friends ───────────────────────────────────
    case "set_friends":
      return { ...store, friends: action.payload };

    case "set_incoming_requests":
      return { ...store, incomingRequests: action.payload };

    case "set_outgoing_requests":
      return { ...store, outgoingRequests: action.payload };

    case "remove_friend":
      return {
        ...store,
        friends: store.friends.filter(
          (f) => f.friend?.id !== action.payload
        ),
      };

    case "remove_incoming_request":
      return {
        ...store,
        incomingRequests: store.incomingRequests.filter(
          (r) => r.id !== action.payload
        ),
      };

    case "remove_outgoing_request":
      return {
        ...store,
        outgoingRequests: store.outgoingRequests.filter(
          (r) => r.id !== action.payload
        ),
      };

    case "add_outgoing_request":
      return {
        ...store,
        outgoingRequests: [...store.outgoingRequests, action.payload],
      };

    case "add_friend":
      return { ...store, friends: [...store.friends, action.payload] };

    // ── notifications ─────────────────────────────
    case "set_notifications": {
      const list = action.payload || [];
      const unread = list.filter((n) => !n.is_read).length;
      return { ...store, notifications: list, unreadNotifsCount: unread };
    }

    case "set_unread_notifs_count":
      return { ...store, unreadNotifsCount: action.payload || 0 };

    case "mark_notification_read": {
      const id = action.payload;
      const list = (store.notifications || []).map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      );
      const unread = list.filter((n) => !n.is_read).length;
      return { ...store, notifications: list, unreadNotifsCount: unread };
    }

    case "mark_all_notifications_read": {
      const list = (store.notifications || []).map((n) => ({
        ...n,
        is_read: true,
      }));
      return { ...store, notifications: list, unreadNotifsCount: 0 };
    }

    case "remove_notification": {
      const id = action.payload;
      const list = (store.notifications || []).filter((n) => n.id !== id);
      const unread = list.filter((n) => !n.is_read).length;
      return { ...store, notifications: list, unreadNotifsCount: unread };
    }

    // ── fallback : ne pas crasher ─────────────────
    default:
      console.warn("Unknown action type:", action.type);
      return store;
  }
}
