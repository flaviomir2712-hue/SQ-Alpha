import { useState } from "react";
import { Card, Badge, Button, Form, Spinner } from "react-bootstrap";
import {
  FiCalendar,
  FiClock,
  FiMapPin,
  FiTag,
  FiStar,
  FiUsers,
  FiEdit2,
  FiSave,
  FiX,
} from "react-icons/fi";

// =============================================================
// CompanyEventCard — una tarjeta de evento dentro del hub de empresas
// (Phase 5a). Muestra los datos enriquecidos de GET /api/manage/events:
// foto, título, precio, conteo "at your place" (at_place_count), nota
// privada de equipo (team_note, editable inline) y nº de reseñas
// (reviews_count). Click en la card → abre el EventModal (vía onOpen).
// Estilo coherente con EventsList (.event-card, tema oscuro de SideQuest).
// =============================================================

const API = import.meta.env.VITE_BACKEND_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const apiSaveTeamNote = async (eventId, teamNote) => {
  const res = await fetch(`${API}/api/events/${eventId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ team_note: teamNote }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
  return data;
};

const CSS = `
.company-event-card {
  background: #161922;
  border: 1px solid #262a36;
  border-radius: 14px;
  color: #e9ecef;
  overflow: hidden;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
  max-width: 100%;
}
.company-event-card:hover {
  border-color: #3a3f55;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  transform: translateY(-2px);
}
.company-event-card-img {
  width: 100%; height: 150px; object-fit: cover;
  border-bottom: 1px solid #262a36;
}
.company-event-card-noimg {
  width: 100%; height: 150px;
  background: #0b0d12;
  display: flex; align-items: center; justify-content: center;
  border-bottom: 1px solid #262a36;
}
.company-event-card-noimg img { width: 64px; height: 64px; object-fit: contain; opacity: 0.5; }
.cec-meta {
  display: flex; align-items: center; gap: 0.35rem;
  color: #adb5bd; font-size: 0.85rem;
}
.cec-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 0.7rem; font-weight: 600;
  padding: 3px 9px; border-radius: 999px;
  border: 1px solid #262a36; background: #0f111a; color: #adb5bd;
}
.cec-chip.price   { color: #34d399; border-color: rgba(52,211,153,0.4); }
.cec-chip.place   { color: #22d3ee; border-color: rgba(34,211,238,0.4); }
.cec-chip.reviews { color: #facc15; border-color: rgba(250,204,21,0.4); }
.cec-team {
  margin-top: 0.75rem; padding-top: 0.65rem;
  border-top: 1px dashed #2a2f42;
}
.cec-team-label {
  display: flex; align-items: center; justify-content: space-between;
  color: #8a93a5; font-size: 0.7rem; text-transform: uppercase;
  letter-spacing: 0.04em; margin-bottom: 0.35rem;
}
.cec-team-note {
  color: #c9b88a; font-size: 0.85rem; white-space: pre-wrap;
  word-break: break-word;
}
.cec-team-empty { color: #5c6470; font-size: 0.82rem; font-style: italic; }
.company-event-card .form-control,
.company-event-card .form-control:focus {
  background-color: #0f111a !important;
  color: #e9ecef !important;
  border-color: #2a2f42 !important;
  box-shadow: none;
  font-size: 0.85rem;
}
.cec-icon-btn {
  background: transparent !important; border: none !important;
  color: #8a93a5 !important; padding: 0 0.2rem !important;
}
.cec-icon-btn:hover { color: #fff !important; }
`;

export const CompanyEventCard = ({ event, onOpen, onChanged, canEditTeamNote = true }) => {
  const [editing, setEditing] = useState(false);
  const [note, setNote]       = useState(event.team_note || "");
  const [saving, setSaving]   = useState(false);
  const [savedNote, setSavedNote] = useState(event.team_note || "");

  const stop = (e) => e.stopPropagation();

  const saveNote = async (e) => {
    stop(e);
    setSaving(true);
    try {
      await apiSaveTeamNote(event.id, note.trim() || null);
      setSavedNote(note.trim());
      setEditing(false);
      onChanged && onChanged();
    } catch (_) {
      /* the textarea keeps what was typed; the user can retry */
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = (e) => {
    stop(e);
    setNote(savedNote);
    setEditing(false);
  };

  const hasPrice = event.price !== "" && event.price != null;
  const durLabel =
    event.duration_min && event.duration_min > 0
      ? (event.duration_min % 60 === 0
          ? `${event.duration_min / 60}h`
          : `${event.duration_min} min`)
      : null;

  return (
    <Card className="company-event-card h-100" onClick={() => onOpen(event.id)}>
      <style>{CSS}</style>

      {event.image ? (
        <img src={event.image} alt={event.title || "Event"} className="company-event-card-img" />
      ) : (
        <div className="company-event-card-noimg" aria-hidden="true">
          <img src="/logoSideQuest.png" alt="" />
        </div>
      )}

      <Card.Body>
        <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
          <h2 className="text-light text-truncate fs-6 fw-bold mb-0">
            {event.title || "(untitled event)"}
          </h2>
          {!event.is_public && <Badge bg="secondary">Private</Badge>}
        </div>

        <div className="cec-meta mb-1">
          <FiCalendar /> {event.date} <FiClock className="ms-2" /> {event.time}
          {durLabel && <span className="ms-2 text-secondary">· {durLabel}</span>}
        </div>
        {event.location && (
          <div className="cec-meta mb-2 text-truncate" title={event.location}>
            <FiMapPin /> {event.location}
          </div>
        )}

        <div className="d-flex flex-wrap gap-2 mb-1">
          {hasPrice && (
            <span className="cec-chip price">
              <FiTag size={12} /> € {Number(event.price).toFixed(2)}
            </span>
          )}
          <span className="cec-chip place" title="Events users created at your place">
            <FiUsers size={12} /> {event.at_place_count ?? 0} at your place
          </span>
          <span className="cec-chip reviews" title="Reviews after the event">
            <FiStar size={12} /> {event.reviews_count ?? 0} reviews
          </span>
        </div>

        {/* Private team note (briefing). Editable inline. */}
        <div className="cec-team" onClick={stop}>
          <div className="cec-team-label">
            <span>Team note</span>
            {canEditTeamNote && !editing && (
              <Button className="cec-icon-btn" size="sm" onClick={(e) => { stop(e); setEditing(true); }}>
                <FiEdit2 size={14} />
              </Button>
            )}
          </div>

          {editing ? (
            <>
              <Form.Control
                as="textarea"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Private briefing for your team before the event…"
                onClick={stop}
                autoFocus
              />
              <div className="d-flex gap-2 mt-2">
                <Button variant="primary" size="sm" onClick={saveNote} disabled={saving}>
                  {saving ? <Spinner size="sm" animation="border" /> : <><FiSave className="me-1" /> Save</>}
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={cancelEdit} disabled={saving}>
                  <FiX className="me-1" /> Cancel
                </Button>
              </div>
            </>
          ) : savedNote ? (
            <div className="cec-team-note">{savedNote}</div>
          ) : (
            <div className="cec-team-empty">No note yet.</div>
          )}
        </div>
      </Card.Body>
    </Card>
  );
};

export default CompanyEventCard;
