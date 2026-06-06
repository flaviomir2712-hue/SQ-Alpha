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

// =====================================================
// INLINE API HELPERS (consistent with friends/navbar style)
// =====================================================
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

/* Red dot indicator for unread notifs */
.sq-bottom-nav-dot {
  position: absolute;
  top: 6px;
  right: 10px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #0f111a;
  animation: sq-bottom-dot-pulse 2s ease-in-out infinite;
}
@keyframes sq-bottom-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
  50%      { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
}

/* Hide when any Bootstrap modal is open */
body.modal-open .sq-bottom-nav { display: none; }


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
  return (user.email || "?").charAt(0).toUpperCase();
};

const levelColor = (level) => {
  if (level === "Very active") return "success";
  if (level === "Active") return "info";
  return "secondary";
};

// =====================================================
// MAIN
// =====================================================
export const BottomNavbar = () => {
  const location = useLocation();
  const { store } = useGlobalReducer();

  const isLogged = !!localStorage.getItem("token");
  const notifUnread = store.unreadNotifsCount || 0;

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const [showProfile, setShowProfile] = useState(false);
  const [showQuest, setShowQuest] = useState(false);

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
    try {
      const { compressImage } = await import("../utils/uploadImage");
      const dataUrl = await compressImage(file, "profile");
      setProfile((p) => ({ ...p, profile_picture_url: dataUrl }));
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
          to="/"
          className={`sq-bottom-nav-item ${isActive("/") ? "active" : ""}`}
          title="Home"
          aria-label="Home"
        >
          <FiHome size={22} />
        </Link>

        <Link
          to="/messages"
          className={`sq-bottom-nav-item ${isActive("/messages") ? "active" : ""}`}
          title="Chatroom"
          aria-label="Chatroom"
        >
          <FiMessageSquare size={22} />
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

        <button
          type="button"
          className="sq-bottom-nav-item"
          onClick={() => setShowProfile(true)}
          title="Profile"
          aria-label="Profile"
        >
          <FiUser size={22} />
          {notifUnread > 0 && <span className="sq-bottom-nav-dot" aria-hidden="true" />}
        </button>
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
              {/* AVATAR (read-only display, same as before) */}
              <div className="text-center mb-4">
                {profile.profile_picture_url ? (
                  <img
                    src={profile.profile_picture_url}
                    alt="profile"
                    className="profile-avatar"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                ) : (
                  <div className="profile-avatar profile-avatar-fallback">
                    {initials(profile)}
                  </div>
                )}
                {profile.username && (
                  <div className="profile-username mt-2">
                    @{profile.username}
                  </div>
                )}
                <div className="text-secondary small mt-1">
                  {profile.email}
                </div>
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
          // refresh whatever needs refreshing (map, store, etc.)
        }}
      />
    </>
  );
};