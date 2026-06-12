import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Button,
  Modal,
  Form,
  Spinner,
  Alert,
  ProgressBar,
  Row,
  Col,
  Badge,
} from "react-bootstrap";
import {
  FiHome,
  FiPlus,
  FiMessageSquare,
  FiUser,
  FiCalendar,
  FiUsers,
  FiActivity,
  FiImage,
  FiX,
} from "react-icons/fi";

import { EventModal } from "./EventModal";
import useGlobalReducer from "../hooks/useGlobalReducer";
// Tanda 7D — señal de sesión basada en el user persistido (el JWT vive
// en una cookie httpOnly).
import { isLoggedIn } from "../services/auth";
// Tanda 7F2 — aviso local "los eventos cambiaron" para que Mapview
// refetchee al crear desde el "+" del pill.
import { announceEventsChanged } from "../services/socket";

// Tanda 7A — Swap con el Navbar: el acceso a "My Profile" se movió al
// hamburger menu del Navbar y el pill de aquí abajo pasa a llevar a
// /friends. El modal de perfil SIGUE viviendo en este componente
// (siempre montado via Layout); el Navbar lo abre disparando este
// evento custom — mismo patrón que SHOW_ONBOARDING_EVENT en
// Onboarding.jsx.
export const SHOW_PROFILE_EVENT = "sq:show-profile";

// =====================================================
// INLINE API HELPERS (consistent with friends/navbar style)
// =====================================================
const API = import.meta.env.VITE_BACKEND_URL;

// Tanda 7D — la autenticación viaja en la cookie httpOnly + X-CSRF-TOKEN,
// añadidos por el parche global de fetch (services/auth.js).
const authHeaders = () => ({
  "Content-Type": "application/json",
});

const handle = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
  return data;
};

const apiGetMyProfile = () =>
  fetch(`${API}/api/profile/me`, { headers: authHeaders() }).then(handle);

const apiUpdateMyProfile = (payload) =>
  fetch(`${API}/api/profile/me`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  }).then(handle);

// Convert a File / Blob to base64 dataURL — same approach used for
// event.image and chat media. The backend stores it directly in
// profile_picture_url (Text column).
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// =====================================================
// INLINE STYLES (dark mode, consistent with Friends page)
// Includes the Instagram-style pill bottom-nav (glassmorphism)
// =====================================================
const PROFILE_CSS = `
/* ─────────────────────────────────────────────────────
   Bottom nav — floating pill with glassmorphism.
   Visible on all screen sizes.
   ───────────────────────────────────────────────────── */
.sq-bottom-nav {
  position: fixed;
  left: 50%;
  bottom: calc(1rem + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 1040;

  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.45rem 0.55rem;

  background: rgba(15, 17, 26, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);

  -webkit-backdrop-filter: blur(20px) saturate(180%);
          backdrop-filter: blur(20px) saturate(180%);
}

.sq-bottom-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 44px;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.62);
  text-decoration: none;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease, transform 0.15s ease;
}
.sq-bottom-nav-item:hover { color: rgba(255, 255, 255, 0.95); }
.sq-bottom-nav-item:active { transform: scale(0.93); }
.sq-bottom-nav-item.active {
  background: rgba(255, 255, 255, 0.10);
  color: #fff;
}

/* Centre CTA: "+ Quest" with gradient */
.sq-bottom-nav-create {
  background: linear-gradient(135deg, #6366f1, #ec4899);
  color: #fff;
  width: 50px;
  height: 50px;
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.45);
}
.sq-bottom-nav-create:hover {
  background: linear-gradient(135deg, #4f46e5, #db2777);
  color: #fff;
}

/* Red counter badge for unread chat messages on the Chatroom pill —
   mismo rol que el Badge bg="danger" del botón de mail del Navbar,
   adaptado al estilo glassmorphism de la pill. */
.sq-bottom-nav-badge {
  position: absolute;
  top: 2px;
  right: 8px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  border: 2px solid #0f111a;
}

/* Hide when any Bootstrap modal is open */
body.modal-open .sq-bottom-nav { display: none; }

/* ── FIX bug #9 — Pill no cabe en iPhone SE (320px) ──────
   Cálculo del ancho de la pill por defecto:
     5 items: 4 normales (58px) + 1 create (50px) = 282px
     gaps:    4 × 4px = 16px
     padding: 2 × 8.8px (0.55rem) = 17.6px
     border:  2 × 1px = 2px
     TOTAL:   ~318px → cabe en 320 con 2px de margen, pero el
     padding lateral del viewport (y el shadow) lo empuja fuera.
   En <360px reducimos un poco todo para que entre cómodo y
   quede igual de "tappable" (touch targets ≥40×40px guideline
   de iOS HIG). 48×40 sigue siendo accesible. */
@media (max-width: 359.98px) {
  .sq-bottom-nav {
    gap: 0.2rem;
    padding: 0.35rem 0.45rem;
  }
  .sq-bottom-nav-item {
    width: 48px;
    height: 40px;
  }
  .sq-bottom-nav-create {
    width: 44px;
    height: 44px;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.45);
  }
  .sq-bottom-nav-item svg {
    width: 20px;
    height: 20px;
  }
  .sq-bottom-nav-create svg {
    width: 22px;
    height: 22px;
  }
}


/* ─────────────────────────────────────────────────────
   Profile modal
   ───────────────────────────────────────────────────── */
.profile-modal .modal-content {
  background: #161922;
  color: #e9ecef;
  border: 1px solid #262a36;
  border-radius: 14px;
}
.profile-modal .modal-header,
.profile-modal .modal-footer {
  border-color: #262a36;
}
.profile-modal .form-control,
.profile-modal .form-control:focus {
  background-color: #0f111a !important;
  color: #e9ecef !important;
  border-color: #2a2f42 !important;
  box-shadow: none;
}
.profile-modal .form-control::placeholder { color: #6c757d; }
.profile-modal .form-label {
  color: #adb5bd;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.profile-stat {
  background: #0f111a;
  border: 1px solid #262a36;
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
}
.profile-stat .stat-value { font-size: 1.6rem; font-weight: 700; color: #fff; }
.profile-stat .stat-label {
  font-size: 0.8rem;
  color: #adb5bd;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.profile-avatar {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 3px solid #6366f1;
  object-fit: cover;
  background: #0f111a;
  display: block;
  margin: 0 auto;
}
.profile-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #ec4899);
  margin: 0 auto;
}
.activity-bar .progress { background: #0f111a; height: 14px; border-radius: 10px; }
.activity-bar .progress-bar { background: linear-gradient(90deg, #6366f1, #ec4899); }

/* Tanda 7C — Reward por actividad: el aro del avatar cambia de color con
   el nivel. Misma paleta que el Badge del activity bar (levelColor):
   secondary → gris, info → cian, success → verde. Lo ven el propio
   usuario (aquí) y sus amigos (Friends / FriendProfile). */
.profile-avatar.level-low    { border-color: #6c757d; }
.profile-avatar.level-active { border-color: #22d3ee; box-shadow: 0 0 12px rgba(34, 211, 238, 0.35); }
.profile-avatar.level-very   { border-color: #22c55e; box-shadow: 0 0 14px rgba(34, 197, 94, 0.45); }

/* Puntos de la leyenda de rewards bajo la activity bar */
.reward-dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  margin-right: 0.3rem;
}
.reward-dot.low  { background: #6c757d; }
.reward-dot.mid  { background: #22d3ee; }
.reward-dot.high { background: #22c55e; }

/* @username title shown above the email in the profile header */
.profile-username {
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.01em;
}

/* Photo picker (replaces the old URL input) */
.profile-photo-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
}
.profile-photo-empty {
  width: 110px; height: 110px;
  border-radius: 50%;
  border: 3px dashed #2a2f42;
  display: flex; align-items: center; justify-content: center;
  color: #6c757d;
  background: #0f111a;
}
`;

// =====================================================
// HELPERS
// =====================================================
const initials = (user) => {
  if (!user) return "?";
  const f = (user.first_name || "").trim().charAt(0);
  const l = (user.last_name || "").trim().charAt(0);
  if (f || l) return `${f}${l}`.toUpperCase();
  // RGPD: fallback al primer char del username, NUNCA del email.
  return (user.username || "?").charAt(0).toUpperCase();
};

const levelColor = (level) => {
  if (level === "Very active") return "success";
  if (level === "Active") return "info";
  return "secondary";
};

// Tanda 7C — clase CSS del aro-reward del avatar según nivel de actividad.
// Mapea 1:1 con los strings que devuelve el backend (_compute_stats).
const levelRingClass = (level) => {
  if (level === "Very active") return "level-very";
  if (level === "Active") return "level-active";
  return "level-low";
};

// =====================================================
// MAIN
// =====================================================
export const BottomNavbar = () => {
  const location = useLocation();
  const { store } = useGlobalReducer();

  // Tanda 7D — señal de sesión = user persistido (el JWT vive en una
  // cookie httpOnly que JS no puede leer).
  const isLogged = isLoggedIn();
  // Total de mensajes de chat no leídos — lo mantiene fresco el poll de
  // /chat/rooms del Navbar (cada 15s), ambos montados juntos en Layout.
  const chatUnread = store.chatUnreadTotal || 0;

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const [showProfile, setShowProfile] = useState(false);
  const [showQuest, setShowQuest] = useState(false);

  // Tanda 7A — El Navbar (menú hamburguesa → "My Profile") abre el modal
  // de perfil disparando SHOW_PROFILE_EVENT. Mismo patrón listen-and-open
  // que usa Onboarding.jsx con su propio evento.
  useEffect(() => {
    const open = () => setShowProfile(true);
    window.addEventListener(SHOW_PROFILE_EVENT, open);
    return () => window.removeEventListener(SHOW_PROFILE_EVENT, open);
  }, []);

  // PROFILE STATE (real, from backend)
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileToast, setProfileToast] = useState(null);

  // Hidden <input type="file"> driven by the visible button below
  const photoInputRef = useRef(null);

  // QUEST STATE (unchanged — local stub)
  const [eventData, setEventData] = useState({
    date: "",
    time: "",
    location: "",
    details: "",
    image: "",
    invitedFriends: [],
  });

  const friends = [
    { id: 1, name: "Sarah Kim", username: "@sarahk" },
    { id: 2, name: "Lucas Reed", username: "@lucasr" },
    { id: 3, name: "Mia Lopez", username: "@mial" },
  ];

  // =====================================================
  // LOAD PROFILE when modal opens
  // =====================================================
  useEffect(() => {
    if (!showProfile) return;
    (async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const data = await apiGetMyProfile();
        setProfile(data);
      } catch (e) {
        setProfileError(e.message);
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [showProfile]);

  // =====================================================
  // PROFILE HANDLERS
  // =====================================================
  const handleProfileChange = (e) => {
    setProfile((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  // ----- photo upload (replaces the URL input) -----
  const handlePickPhoto = () => {
    if (photoInputRef.current) photoInputRef.current.click();
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file later
    if (!file) return;
    // No hard size cap — compressImage reduces even a 25 MB iPhone shot to
    // ~250 KB. The browser's FileReader handles the original easily.
    // Tanda 7V — compressAndUpload sube el resultado a Cloudinary y
    // devuelve la URL hosteada (con fallback automático a base64 si la
    // subida falla): en la base se guarda la URL, no megas de base64.
    try {
      const { compressAndUpload } = await import("../utils/uploadImage");
      const url = await compressAndUpload(file, "profile");
      setProfile((p) => ({ ...p, profile_picture_url: url }));
    } catch (err) {
      console.error("Image compression failed, falling back to raw base64:", err);
      try {
        const dataUrl = await fileToBase64(file);
        setProfile((p) => ({ ...p, profile_picture_url: dataUrl }));
      } catch {
        setProfileError("Failed to read file");
      }
    }
  };

  const removePhoto = () => {
    setProfile((p) => ({ ...p, profile_picture_url: "" }));
  };

  const saveProfile = async () => {
    if (!profile) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      const payload = {
        username: profile.username || null,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        city: profile.city || null,
        bio: profile.bio || null,
        profile_picture_url: profile.profile_picture_url || null,
        birthdate: profile.birthdate || null,
        phone: profile.phone || null,
      };
      const data = await apiUpdateMyProfile(payload);
      // Guard: ignore malformed responses. Without this, an unexpected
      // payload (data.user === undefined) would persist the literal
      // string "undefined" in localStorage and crash initialStore on
      // the next boot.
      if (data && data.user && typeof data.user === "object") {
        setProfile((p) => ({ ...p, ...data.user }));
        localStorage.setItem("user", JSON.stringify(data.user));
      }
      setProfileToast("Profile saved");
      setTimeout(() => setProfileToast(null), 2000);
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileSaving(false);
    }
  };

  // =====================================================
  // QUEST HANDLERS (unchanged)
  // =====================================================
  const handleQuestChange = (e) => {
    setEventData({ ...eventData, [e.target.name]: e.target.value });
  };

  const handleQuestImage = (e) => {
    const file = e.target.files[0];
    if (file) {
      setEventData({ ...eventData, image: URL.createObjectURL(file) });
    }
  };

  const toggleFriend = (id) => {
    setEventData((prev) => {
      const exists = prev.invitedFriends.includes(id);
      return {
        ...prev,
        invitedFriends: exists
          ? prev.invitedFriends.filter((f) => f !== id)
          : [...prev.invitedFriends, id],
      };
    });
  };

  const createQuest = () => {
    console.log("QUEST:", eventData);
    setShowQuest(false);
  };

  // =====================================================
  // RENDER
  // =====================================================
  const stats = profile?.stats;

  if (!isLogged) return null;

  return (
    <>
      <style>{PROFILE_CSS}</style>

      {/* ============================================
          PILL NAV — Instagram-like glassmorphism, always visible
      ============================================ */}
      <nav className="sq-bottom-nav" role="navigation" aria-label="Bottom menu">
        <Link
          to="/app"
          className={`sq-bottom-nav-item ${isActive("/app") ? "active" : ""}`}
          title="Home"
          aria-label="Home"
        >
          <FiHome size={22} />
        </Link>

        <Link
          to="/messages"
          className={`sq-bottom-nav-item ${isActive("/messages") ? "active" : ""}`}
          title="Chatroom"
          aria-label={`Chatroom${chatUnread > 0 ? ` (${chatUnread} unread)` : ""}`}
        >
          <FiMessageSquare size={22} />
          {/* Contador rojo de mensajes no leídos — espejo del badge del
              botón de mail del Navbar, alimentado por el mismo
              store.chatUnreadTotal. */}
          {chatUnread > 0 && (
            <span className="sq-bottom-nav-badge" aria-hidden="true">
              {chatUnread > 99 ? "99+" : chatUnread}
            </span>
          )}
        </Link>

        <button
          type="button"
          className="sq-bottom-nav-item sq-bottom-nav-create"
          onClick={() => setShowQuest(true)}
          title="Create quest"
          aria-label="Create quest"
        >
          <FiPlus size={26} />
        </button>

        <Link
          to="/events"
          className={`sq-bottom-nav-item ${isActive("/events") ? "active" : ""}`}
          title="Events"
          aria-label="Events"
        >
          <FiCalendar size={22} />
        </Link>

        {/* Tanda 7A — Friends ocupa el sitio del antiguo botón de perfil.
            El punto rojo de notificaciones que vivía aquí desaparece: la
            campana del Navbar (NotificationBell) ya muestra ese contador. */}
        <Link
          to="/friends"
          className={`sq-bottom-nav-item ${isActive("/friends") ? "active" : ""}`}
          title="Friends"
          aria-label="Friends"
        >
          <FiUsers size={22} />
        </Link>
      </nav>

      {/* =====================================================
          PROFILE MODAL
      ===================================================== */}
      <Modal
        show={showProfile}
        onHide={() => setShowProfile(false)}
        centered
        size="lg"
        dialogClassName="profile-modal"
      >
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title>My Profile</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {profileLoading && (
            <div className="text-center py-4">
              <Spinner animation="border" />
            </div>
          )}

          {profileError && (
            <Alert variant="danger" onClose={() => setProfileError(null)} dismissible>
              {profileError}
            </Alert>
          )}

          {profileToast && <Alert variant="success">{profileToast}</Alert>}

          {!profileLoading && profile && (
            <>
              {/* AVATAR — Tanda 7C: el aro toma el color del nivel de
                  actividad (reward). */}
              <div className="text-center mb-4">
                {profile.profile_picture_url ? (
                  <img
                    src={profile.profile_picture_url}
                    alt="profile"
                    className={`profile-avatar ${levelRingClass(stats?.activity_level)}`}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                ) : (
                  <div className={`profile-avatar profile-avatar-fallback ${levelRingClass(stats?.activity_level)}`}>
                    {initials(profile)}
                  </div>
                )}
                {profile.username && (
                  <div className="profile-username mt-2">
                    @{profile.username}
                  </div>
                )}
                {/* RGPD: en lugar del email del usuario (que NO debe
                    aparecer en la UI), mostramos su nombre real si
                    lo ha rellenado; si no, dejamos solo el @username
                    arriba. */}
                {(profile.first_name || profile.last_name) && (
                  <div className="text-secondary small mt-1">
                    {[profile.first_name, profile.last_name].filter(Boolean).join(" ")}
                  </div>
                )}
              </div>

              {/* STATS */}
              <Row className="g-2 mb-4">
                <Col xs={6} md={4}>
                  <div className="profile-stat">
                    <FiCalendar size={20} className="text-info mb-1" />
                    <div className="stat-value">{stats?.events_created_count ?? 0}</div>
                    <div className="stat-label">Created</div>
                  </div>
                </Col>
                <Col xs={6} md={4}>
                  <div className="profile-stat">
                    <FiUsers size={20} className="text-warning mb-1" />
                    <div className="stat-value">{stats?.events_participated_count ?? 0}</div>
                    <div className="stat-label">Participated</div>
                  </div>
                </Col>
                <Col xs={12} md={4}>
                  <div className="profile-stat">
                    <FiActivity size={20} className="text-success mb-1" />
                    <div className="stat-value">{stats?.activity_avg_per_week ?? 0}</div>
                    <div className="stat-label">Events / week</div>
                  </div>
                </Col>
              </Row>

              {/* ACTIVITY BAR */}
              <div className="mb-4 activity-bar">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small text-secondary text-uppercase fw-semibold">
                    Activity
                  </span>
                  <Badge bg={levelColor(stats?.activity_level)}>
                    {stats?.activity_level ?? "—"}
                  </Badge>
                </div>
                <ProgressBar now={stats?.activity_percent ?? 0} />
                <div className="small text-secondary mt-1">
                  Last 4 weeks · {stats?.events_participated_count ?? 0} total events
                </div>
                {/* Tanda 7C — leyenda de rewards: cada etapa de la barra
                    desbloquea un color de aro para tu avatar, visible
                    también por tus amigos. */}
                <div className="small text-secondary mt-2">
                  Reward — your avatar ring levels up with you:{" "}
                  <span className="text-nowrap"><span className="reward-dot low" />Low</span>{" · "}
                  <span className="text-nowrap"><span className="reward-dot mid" />Active</span>{" · "}
                  <span className="text-nowrap"><span className="reward-dot high" />Very active</span>
                </div>
              </div>

              {/* EDITABLE FIELDS */}
              <Form>
                <Row>
                  <Col md={6} className="mb-3">
                    <Form.Label>First name</Form.Label>
                    <Form.Control
                      name="first_name"
                      value={profile.first_name || ""}
                      onChange={handleProfileChange}
                      placeholder="Alex"
                    />
                  </Col>
                  <Col md={6} className="mb-3">
                    <Form.Label>Last name</Form.Label>
                    <Form.Control
                      name="last_name"
                      value={profile.last_name || ""}
                      onChange={handleProfileChange}
                      placeholder="Chen"
                    />
                  </Col>
                </Row>

                <Row>
                  <Col md={6} className="mb-3">
                    <Form.Label>Username</Form.Label>
                    <Form.Control
                      name="username"
                      value={profile.username || ""}
                      onChange={handleProfileChange}
                      placeholder="alexchen"
                    />
                  </Col>
                  <Col md={6} className="mb-3">
                    <Form.Label>City</Form.Label>
                    <Form.Control
                      name="city"
                      value={profile.city || ""}
                      onChange={handleProfileChange}
                      placeholder="Madrid"
                    />
                  </Col>
                </Row>

                <Row>
                  <Col md={6} className="mb-3">
                    <Form.Label>Birthdate</Form.Label>
                    <Form.Control
                      type="date"
                      name="birthdate"
                      value={profile.birthdate || ""}
                      onChange={handleProfileChange}
                    />
                  </Col>
                  <Col md={6} className="mb-3">
                    <Form.Label>Phone</Form.Label>
                    <Form.Control
                      name="phone"
                      value={profile.phone || ""}
                      onChange={handleProfileChange}
                      placeholder="+34 ..."
                    />
                  </Col>
                </Row>

                {/* ---------- PHOTO (file upload, replaces URL input) ---------- */}
                <Form.Label>Profile picture</Form.Label>
                <div className="profile-photo-picker mb-3">
                  {profile.profile_picture_url ? (
                    <img
                      src={profile.profile_picture_url}
                      alt="profile preview"
                      className="profile-avatar"
                    />
                  ) : (
                    <div className="profile-photo-empty">
                      <FiUser size={32} />
                    </div>
                  )}

                  <div className="d-flex gap-2">
                    <Button
                      variant="outline-light"
                      size="sm"
                      onClick={handlePickPhoto}
                    >
                      <FiImage className="me-1" />
                      {profile.profile_picture_url ? "Change photo" : "Upload photo"}
                    </Button>
                    {profile.profile_picture_url && (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={removePhoto}
                      >
                        <FiX className="me-1" /> Remove
                      </Button>
                    )}
                  </div>
                  <small className="text-secondary">
                    From your device · auto-compressed
                  </small>

                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handlePhotoChange}
                  />
                </div>

                <Form.Label>Bio</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  name="bio"
                  value={profile.bio || ""}
                  onChange={handleProfileChange}
                  placeholder="A few words about you..."
                />
              </Form>
            </>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="outline-light" onClick={() => setShowProfile(false)}>
            Close
          </Button>
          <Button onClick={saveProfile} disabled={profileSaving || !profile}>
            {profileSaving ? <Spinner animation="border" size="sm" /> : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* =====================================================
          QUEST MODAL — now powered by the shared EventModal
      ===================================================== */}
      <EventModal
        show={showQuest}
        onHide={() => setShowQuest(false)}
        eventId={null}
        prefillCoords={null}
        currentUser={JSON.parse(localStorage.getItem("user") || "null")}
        onSaved={() => {
          // Tanda 7F2 — este callback estaba VACÍO: crear un evento desde
          // el "+" del pill no refrescaba el mapa (Mapview solo refetchea
          // con su propio modal). Ahora avisamos vía evento DOM local y
          // Mapview refetchea al instante — y el resto de afectados
          // recibe el ping "event:changed" por socket desde el backend.
          announceEventsChanged();
        }}
      />
    </>
  );
};