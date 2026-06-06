// Safely parse a JSON string from localStorage. Returns `null` if the
// value is missing, the literal string "undefined" (left behind by code
// that did setItem(key, undefined)), or any other malformed JSON.
// Without this guard, a stored "undefined" crashes the entire app with
// `SyntaxError: "undefined" is not valid JSON` at boot.
const safeParse = (raw) => {
  if (raw === null || raw === undefined || raw === "undefined" || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Map-event filter persistence
// Three independent dimensions are persisted, all read at boot
// and cleared on logout:
//   - mapFilterDays       → number | null   (look-ahead window)
//   - mapFilterVisibility → "all" | "public" | "private"
//   - mapFilterStatus     → "all" | "going" | "maybe" | "not_going" | "pending" | "created"
// ─────────────────────────────────────────────────────────────
const FILTER_DAYS_KEY       = "sq_map_filter_days";
const FILTER_VISIBILITY_KEY = "sq_map_filter_visibility";
const FILTER_STATUS_KEY     = "sq_map_filter_status";

const VALID_VISIBILITY = new Set(["all", "public", "private"]);
const VALID_STATUS     = new Set(["all", "going", "maybe", "not_going", "pending", "created"]);

const readStoredFilter = () => {
  try {
    const v = localStorage.getItem(FILTER_DAYS_KEY);
    if (v === null || v === "null" || v === "") return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
};

const writeStoredFilter = (val) => {
  try {
    if (val === null || val === undefined) localStorage.removeItem(FILTER_DAYS_KEY);
    else localStorage.setItem(FILTER_DAYS_KEY, String(val));
  } catch { /* ignore */ }
};

const readStoredVisibility = () => {
  try {
    const v = localStorage.getItem(FILTER_VISIBILITY_KEY);
    return VALID_VISIBILITY.has(v) ? v : "all";
  } catch {
    return "all";
  }
};

const writeStoredVisibility = (val) => {
  try {
    if (val === "all" || val === null || val === undefined) localStorage.removeItem(FILTER_VISIBILITY_KEY);
    else if (VALID_VISIBILITY.has(val)) localStorage.setItem(FILTER_VISIBILITY_KEY, val);
  } catch { /* ignore */ }
};

const readStoredStatus = () => {
  try {
    const v = localStorage.getItem(FILTER_STATUS_KEY);
    return VALID_STATUS.has(v) ? v : "all";
  } catch {
    return "all";
  }
};

const writeStoredStatus = (val) => {
  try {
    if (val === "all" || val === null || val === undefined) localStorage.removeItem(FILTER_STATUS_KEY);
    else if (VALID_STATUS.has(val)) localStorage.setItem(FILTER_STATUS_KEY, val);
  } catch { /* ignore */ }
};

export const initialStore = () => {
  return {
    message: null,
    user: safeParse(localStorage.getItem("user")),
    token: localStorage.getItem("token") || null,
    todos: [
      { id: 1, title: "Make the bed", background: null },
      { id: 2, title: "Do my homework", background: null },
    ],

    chatRooms: [],
    chatUnreadTotal: 0,

    friends: [],
    incomingRequests: [],
    outgoingRequests: [],

    notifications: [],
    unreadNotifsCount: 0,

    // ── Map filter (navbar dropdown) ──────────────────
    // Number of days to look ahead. null = no filter (show all upcoming).
    // Persisted to localStorage so the choice survives reloads.
    mapFilterDays:       readStoredFilter(),
    // Visibility filter: "all" | "public" | "private". Default "all".
    mapFilterVisibility: readStoredVisibility(),
    // Status filter: "all" | "going" | "maybe" | "not_going" | "pending" | "created".
    // "all" keeps the legacy behaviour of hiding pending invitations from the map.
    // "pending" inverts it to show ONLY pending invitations.
    mapFilterStatus:     readStoredStatus(),

    // ── Map recenter request (bump-and-listen) ────────
    // Incremented every time the user clicks the pill-nav Home button
    // while already on a page that shows the map (/, /map). Mapview
    // useEffect watches this value and calls recenterOnUser() on every
    // change, skipping the initial 0. Using a counter (rather than a
    // boolean) means repeated clicks always re-fire even without a
    // reset step.
    recenterMapNonce: 0,
  };
};

const sumUnread = (rooms) =>
  (rooms || []).reduce((sum, r) => sum + (r.unread_count || 0), 0);

export default function storeReducer(store, action = {}) {
  switch (action.type) {
    case "set_hello":
      return { ...store, message: action.payload };

    case "add_task": {
      const { id, color } = action.payload;
      return {
        ...store,
        todos: store.todos.map((t) =>
          t.id === id ? { ...t, background: color } : t
        ),
      };
    }

    case "set_user":
      // Never write the literal string "undefined" to storage. Treat
      // null/undefined/falsy as "logout".
      if (action.payload && typeof action.payload === "object") {
        localStorage.setItem("user", JSON.stringify(action.payload));
        return { ...store, user: action.payload };
      }
      localStorage.removeItem("user");
      return { ...store, user: null };

    case "set_chat_rooms": {
      const rooms = action.payload || [];
      return { ...store, chatRooms: rooms, chatUnreadTotal: sumUnread(rooms) };
    }

    case "set_chat_unread_total":
      return { ...store, chatUnreadTotal: action.payload || 0 };

    case "mark_room_read_local": {
      const roomId = action.payload;
      const rooms = (store.chatRooms || []).map((r) =>
        r.id === roomId ? { ...r, unread_count: 0 } : r
      );
      return { ...store, chatRooms: rooms, chatUnreadTotal: sumUnread(rooms) };
    }

    case "upsert_chat_room": {
      const room = action.payload;
      if (!room) return store;
      const idx = (store.chatRooms || []).findIndex((r) => r.id === room.id);
      let next;
      if (idx === -1) next = [room, ...(store.chatRooms || [])];
      else { next = [...store.chatRooms]; next[idx] = room; }
      return { ...store, chatRooms: next, chatUnreadTotal: sumUnread(next) };
    }

    case "logout":
      writeStoredFilter(null);
      writeStoredVisibility("all");
      writeStoredStatus("all");
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
        mapFilterDays: null,
        mapFilterVisibility: "all",
        mapFilterStatus: "all",
        recenterMapNonce: 0,
      };

    // ── friends ───────────────────────────────────
    case "set_friends":           return { ...store, friends: action.payload };
    case "set_incoming_requests": return { ...store, incomingRequests: action.payload };
    case "set_outgoing_requests": return { ...store, outgoingRequests: action.payload };
    case "remove_friend":         return { ...store, friends: store.friends.filter(f => f.friend?.id !== action.payload) };
    case "remove_incoming_request": return { ...store, incomingRequests: store.incomingRequests.filter(r => r.id !== action.payload) };
    case "remove_outgoing_request": return { ...store, outgoingRequests: store.outgoingRequests.filter(r => r.id !== action.payload) };
    case "add_outgoing_request":  return { ...store, outgoingRequests: [...store.outgoingRequests, action.payload] };
    case "add_friend":            return { ...store, friends: [...store.friends, action.payload] };

    // ── notifications ─────────────────────────────
    case "set_notifications": {
      const list = action.payload || [];
      return { ...store, notifications: list, unreadNotifsCount: list.filter(n => !n.is_read).length };
    }
    case "set_unread_notifs_count":
      return { ...store, unreadNotifsCount: action.payload || 0 };

    case "mark_notification_read": {
      const list = (store.notifications || []).map(n =>
        n.id === action.payload ? { ...n, is_read: true } : n
      );
      return { ...store, notifications: list, unreadNotifsCount: list.filter(n => !n.is_read).length };
    }
    case "mark_all_notifications_read": {
      const list = (store.notifications || []).map(n => ({ ...n, is_read: true }));
      return { ...store, notifications: list, unreadNotifsCount: 0 };
    }
    case "remove_notification": {
      const list = (store.notifications || []).filter(n => n.id !== action.payload);
      return { ...store, notifications: list, unreadNotifsCount: list.filter(n => !n.is_read).length };
    }

    // ── map filter ────────────────────────────────
    // payload: number of days (1, 3, 7, 14, 30, 90) or null to clear.
    case "set_map_filter_days": {
      const v = action.payload === null || action.payload === undefined ? null : Number(action.payload);
      const safe = (typeof v === "number" && Number.isFinite(v) && v >= 0) ? v : null;
      writeStoredFilter(safe);
      return { ...store, mapFilterDays: safe };
    }

    // payload: "all" | "public" | "private"
    case "set_map_filter_visibility": {
      const v = VALID_VISIBILITY.has(action.payload) ? action.payload : "all";
      writeStoredVisibility(v);
      return { ...store, mapFilterVisibility: v };
    }

    // payload: "all" | "going" | "maybe" | "not_going" | "pending" | "created"
    case "set_map_filter_status": {
      const v = VALID_STATUS.has(action.payload) ? action.payload : "all";
      writeStoredStatus(v);
      return { ...store, mapFilterStatus: v };
    }

    // Clears every map filter dimension at once. Handy for a "Reset filters"
    // button in the dropdown.
    case "reset_map_filters":
      writeStoredFilter(null);
      writeStoredVisibility("all");
      writeStoredStatus("all");
      return {
        ...store,
        mapFilterDays: null,
        mapFilterVisibility: "all",
        mapFilterStatus: "all",
      };

    // ── Map recenter request ──────────────────────
    // Bump-and-listen pattern: the pill-nav Home button dispatches this
    // when the user is already on /, /map. Mapview useEffect watches
    // the nonce and calls recenterOnUser() on every change.
    case "request_recenter_map":
      return { ...store, recenterMapNonce: (store.recenterMapNonce || 0) + 1 };

    default:
      console.warn("Unknown action type:", action.type);
      return store;
  }
}