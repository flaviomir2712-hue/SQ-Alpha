import { useEffect, useMemo, useState } from "react";
import { Spinner, Alert } from "react-bootstrap";
import {
  FiChevronLeft, FiChevronRight, FiCalendar, FiClock, FiMapPin,
  FiPlus, FiCheckCircle, FiHelpCircle, FiXCircle,
} from "react-icons/fi";
import { EventModal } from "../components/EventModal";

// ─── API ─────────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_BACKEND_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});
const handle = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
  return data;
};
const apiListEvents = () =>
  fetch(`${API}/api/events`, { headers: authHeaders() }).then(handle);

// Unified response (going/maybe/not_going). Joins invitees automatically.
const apiRespond = (eventId, response) =>
  fetch(`${API}/api/events/${eventId}/respond`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ response }),
  }).then(handle);

// ─── COLOUR PALETTE ──────────────────────────────────────────────────────────
const PALETTE = ["#a855f7", "#f97316", "#22d3ee", "#34d399", "#f43f5e", "#facc15", "#60a5fa"];
const eventColor = (idx) => PALETTE[idx % PALETTE.length];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

function buildCells(year, month) {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, current: false, date: null });

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push({ day: d, current: true, date: `${year}-${mm}-${dd}` });
  }

  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++)
    cells.push({ day: d, current: false, date: null });

  return cells;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export const Calendar = ({ embedded = false } = {}) => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const [viewYear, setViewYear]         = useState(today.getFullYear());
  const [viewMonth, setViewMonth]       = useState(today.getMonth());
  const [events, setEvents]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalOpen, setModalOpen]       = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);
  const [busyEventId, setBusyEventId]   = useState(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const myId = currentUser?.id;

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiListEvents();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);

  const { byDate, colorMap } = useMemo(() => {
    const byDate = {};
    const colorMap = {};
    let idx = 0;
    for (const ev of events) {
      if (!ev.date) continue;
      if (!byDate[ev.date]) byDate[ev.date] = [];
      byDate[ev.date].push(ev);
      if (colorMap[ev.id] === undefined) colorMap[ev.id] = idx++;
    }
    return { byDate, colorMap };
  }, [events]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const openEvent  = (id) => { setActiveEventId(id); setModalOpen(true); };
  const openCreate = ()    => { setActiveEventId(null); setModalOpen(true); };
  const closeModal = ()    => { setModalOpen(false); setActiveEventId(null); };

  const handleRespond = async (eventId, value, evt) => {
    evt?.stopPropagation();
    if (busyEventId) return;
    setBusyEventId(eventId);
    try {
      const data = await apiRespond(eventId, value);
      const updated = data?.event;
      setEvents((prev) => {
        // Declined invitation → remove from list (no longer visible)
        if (updated && updated.my_status === "none") {
          return prev.filter((e) => e.id !== eventId);
        }
        return prev.map((e) => e.id === eventId ? { ...e, ...(updated || {}) } : e);
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyEventId(null);
    }
  };

  const selectedEvents = selectedDate ? (byDate[selectedDate] || []) : [];

  // Show response bar for invitees and accepted non-creators.
  const showResponseBar = (e) =>
    e.creator_id !== myId &&
    (e.my_status === "pending" || e.my_status === "accepted");

  return (
    <div style={embedded ? S.embeddedWrap : S.page}>
      <style>{CSS}</style>

      {/* HEADER — only shown on the standalone page, not when embedded */}
      {!embedded && (
        <div style={S.header}>
          <div style={S.headerRow}>
            <FiCalendar size={22} color="#6366f1" />
            <h1 style={S.title}>Calendar</h1>
          </div>
          <p style={S.subtitle}>All your events at a glance</p>
        </div>
      )}

      {error && (
        <div style={{ padding: "0 1rem" }}>
          <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>
        </div>
      )}

      {loading ? (
        <div style={S.center}><Spinner animation="border" variant="light" /></div>
      ) : (
        <div style={S.wrap}>

          <div style={S.monthNav}>
            <button style={S.navBtn} onClick={prevMonth}><FiChevronLeft size={20} /></button>
            <span style={S.monthLabel}>{MONTHS[viewMonth]} {viewYear}</span>
            <button style={S.navBtn} onClick={nextMonth}><FiChevronRight size={20} /></button>
          </div>

          <div style={S.dayNames}>
            {DAYS.map(d => <div key={d} style={S.dayName}>{d}</div>)}
          </div>

          <div style={S.grid}>
            {cells.map((cell, i) => {
              const evs        = cell.date ? (byDate[cell.date] || []) : [];
              const isToday    = cell.date === todayStr;
              const isSelected = cell.date === selectedDate;

              return (
                <div
                  key={i}
                  className={[
                    "cal-cell",
                    !cell.current  ? "cal-faded"   : "",
                    isToday        ? "cal-today"   : "",
                    isSelected     ? "cal-selected": "",
                  ].join(" ")}
                  onClick={() => {
                    if (!cell.current || !cell.date) return;
                    setSelectedDate(cell.date === selectedDate ? null : cell.date);
                  }}
                >
                  <span className={`cal-num${isToday ? " cal-num-today" : ""}`}>
                    {cell.day}
                  </span>

                  {evs.slice(0, 2).map(ev => (
                    <div
                      key={ev.id}
                      className={`cal-pill ${ev.my_status === "pending" ? "cal-pill-pending" : ""}`}
                      style={{ borderLeftColor: eventColor(colorMap[ev.id]) }}
                      onClick={(e) => { e.stopPropagation(); openEvent(ev.id); }}
                    >
                      <span className="cal-pill-title">{ev.title || "(untitled)"}</span>
                      <span className="cal-pill-time">{ev.time}</span>
                    </div>
                  ))}

                  {evs.length > 2 && (
                    <span className="cal-more">+{evs.length - 2} more</span>
                  )}
                </div>
              );
            })}
          </div>

          {selectedDate && (
            <div style={S.panel}>
              <div style={S.panelHead}>
                <span style={S.panelTitle}>
                  {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "long", month: "long", day: "numeric",
                  })}
                </span>
                <button style={S.addBtn} onClick={openCreate}>
                  <FiPlus size={14} /> New event
                </button>
              </div>

              {selectedEvents.length === 0 ? (
                <p style={S.empty}>No events this day.</p>
              ) : (
                selectedEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="cal-event-row"
                    style={{ ...S.eventRow, borderLeftColor: eventColor(colorMap[ev.id]) }}
                    onClick={() => openEvent(ev.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.eventTitle}>
                        {ev.title || "(untitled)"}
                        {ev.my_status === "pending" && (
                          <span style={S.pendingTag}>Invited</span>
                        )}
                        {ev.creator_id === myId && (
                          <span style={S.creatorTag}>Creator</span>
                        )}
                      </div>
                      <div style={S.eventMeta}>
                        <FiClock size={11} />
                        <span>{ev.time}</span>
                        {ev.location && (
                          <>
                            <FiMapPin size={11} />
                            <span style={S.loc}>{ev.location}</span>
                          </>
                        )}
                      </div>

                      {showResponseBar(ev) && (
                        <div className="cal-rsvp" onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`cal-rsvp-btn going ${ev.my_rsvp === "going" ? "active" : ""}`}
                            disabled={busyEventId === ev.id}
                            onClick={(e) => handleRespond(ev.id, "going", e)}
                          >
                            <FiCheckCircle size={11} /> Going
                          </button>
                          <button
                            className={`cal-rsvp-btn maybe ${ev.my_rsvp === "maybe" ? "active" : ""}`}
                            disabled={busyEventId === ev.id}
                            onClick={(e) => handleRespond(ev.id, "maybe", e)}
                          >
                            <FiHelpCircle size={11} /> Maybe
                          </button>
                          <button
                            className={`cal-rsvp-btn not_going ${ev.my_rsvp === "not_going" ? "active" : ""}`}
                            disabled={busyEventId === ev.id}
                            onClick={(e) => handleRespond(ev.id, "not_going", e)}
                          >
                            <FiXCircle size={11} /> Not going
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      )}

      <EventModal
        show={modalOpen}
        onHide={closeModal}
        eventId={activeEventId}
        prefillCoords={null}
        currentUser={currentUser}
        onSaved={reload}
        onDeleted={reload}
      />
    </div>
  );
};

export default Calendar;

// ─── INLINE STYLES ────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: "100vh",
    background: `
      radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.15), transparent 60%),
      radial-gradient(900px 500px at 100% 10%, rgba(236,72,153,0.10), transparent 60%),
      #0b0d12`,
    color: "#e9ecef",
    paddingTop: 80,
    paddingBottom: 100,
  },
  header:     { padding: "0 1.25rem 1rem" },
  embeddedWrap: { color: "#e9ecef", paddingBottom: 20 },
  headerRow:  { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 },
  title:      { margin: 0, fontSize: "1.6rem", fontWeight: 700, color: "#fff" },
  subtitle:   { margin: 0, color: "#6c757d", fontSize: "0.9rem" },
  center:     { display: "flex", justifyContent: "center", paddingTop: 80 },
  wrap:       { padding: "0 1rem" },
  monthNav:   { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" },
  navBtn:     { background: "#161922", border: "1px solid #262a36", color: "#e9ecef", borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center" },
  monthLabel: { fontWeight: 700, fontSize: "1.1rem", color: "#fff" },
  dayNames:   { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 },
  dayName:    { textAlign: "center", fontSize: "0.72rem", fontWeight: 600, color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 0" },
  grid:       { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 },
  panel:      { marginTop: "1rem", background: "#161922", border: "1px solid #262a36", borderRadius: 14, padding: "1rem" },
  panelHead:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" },
  panelTitle: { fontWeight: 700, color: "#fff", fontSize: "0.95rem" },
  addBtn:     { background: "linear-gradient(135deg,#6366f1,#4f46e5)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 },
  empty:      { color: "#6c757d", fontSize: "0.9rem", margin: 0 },
  eventRow:   { display: "flex", alignItems: "flex-start", gap: 10, padding: "0.6rem 0.75rem", borderRadius: 10, cursor: "pointer", marginBottom: 4, borderLeft: "3px solid transparent", background: "#0f111a" },
  eventTitle: { fontWeight: 600, color: "#e9ecef", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 },
  eventMeta:  { display: "flex", alignItems: "center", gap: 4, color: "#6c757d", fontSize: "0.78rem", marginTop: 2 },
  loc:        { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 },
  pendingTag: {
    fontSize: "0.6rem", padding: "1px 6px", borderRadius: 999,
    background: "#facc15", color: "#0b0d12", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.04em",
  },
  creatorTag: {
    fontSize: "0.6rem", padding: "1px 6px", borderRadius: 999,
    background: "#22d3ee", color: "#0b0d12", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.04em",
  },
};

const CSS = `
.cal-cell {
  min-height: 80px;
  display: flex;
  flex-direction: column;
  padding: 4px 3px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s;
  overflow: hidden;
}
.cal-cell:hover { background: #161922; }
.cal-faded { cursor: default; opacity: 0.3; }
.cal-faded:hover { background: transparent; }
.cal-today  { background: #1a1d2e; border-color: #6366f1 !important; }
.cal-selected { background: #1e2230 !important; border-color: #a855f7 !important; }
.cal-num {
  font-size: 0.78rem;
  font-weight: 600;
  color: #9ca3af;
  text-align: right;
  padding-right: 3px;
  margin-bottom: 3px;
  line-height: 1;
}
.cal-num-today {
  color: #6366f1 !important;
  font-weight: 800;
}
.cal-pill {
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.06);
  border-left: 3px solid #a855f7;
  border-radius: 4px;
  padding: 2px 4px;
  margin-bottom: 2px;
  cursor: pointer;
  overflow: hidden;
  transition: background 0.12s;
}
.cal-pill:hover { background: rgba(255,255,255,0.12); }
.cal-pill-pending {
  border-left-color: #facc15 !important;
  background: rgba(250,204,21,0.08) !important;
}
.cal-pill-title {
  font-size: 0.68rem;
  font-weight: 600;
  color: #e9ecef;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.cal-pill-time {
  font-size: 0.62rem;
  color: #9ca3af;
  line-height: 1.2;
}
.cal-more {
  font-size: 0.62rem;
  color: #6c757d;
  padding-left: 3px;
  margin-top: 1px;
}
.cal-event-row { transition: background 0.12s; }
.cal-event-row:hover { background: #1e2230 !important; }

/* Response bar for the day-panel events */
.cal-rsvp { display: flex; gap: 4px; margin-top: 8px; }
.cal-rsvp-btn {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid #262a36;
  background: #0f111a;
  color: #6c757d;
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.cal-rsvp-btn:hover { background: #1e2230; color: #e9ecef; }
.cal-rsvp-btn.active.going     { background: rgba(34,211,238,0.15); border-color: #22d3ee; color: #22d3ee; }
.cal-rsvp-btn.active.maybe     { background: rgba(250,204,21,0.15); border-color: #facc15; color: #facc15; }
.cal-rsvp-btn.active.not_going { background: rgba(244,63,94,0.15);  border-color: #f43f5e; color: #f43f5e; }
.cal-rsvp-btn:disabled { opacity: 0.45; pointer-events: none; }
`;