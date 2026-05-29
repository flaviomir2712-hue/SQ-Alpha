import { useState, useEffect } from "react";
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
  FiCompass,
  FiPlus,
  FiMessageSquare,
  FiUser,
  FiCalendar,
  FiUsers,
  FiActivity,
} from "react-icons/fi";

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

// =====================================================
// INLINE STYLES (dark mode, consistent with Friends page)
// =====================================================
const PROFILE_CSS = `
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
}
.profile-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #ec4899);
}
.activity-bar .progress { background: #0f111a; height: 14px; border-radius: 10px; }
.activity-bar .progress-bar { background: linear-gradient(90deg, #6366f1, #ec4899); }

/* Hide the bottom navbar while any Bootstrap modal is open so the
   modal footer (Save / Close buttons) is never covered. */
body.modal-open .bottom-navbar { display: none; }
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
  if (level === "Très actif") return "success";
  if (level === "Actif") return "info";
  return "secondary";
};

// =====================================================
// MAIN
// =====================================================
export const BottomNavbar = () => {
  const [showProfile, setShowProfile] = useState(false);
  const [showQuest, setShowQuest] = useState(false);

  // PROFILE STATE (real, from backend)
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileToast, setProfileToast] = useState(null);

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

  const saveProfile = async () => {
    if (!profile) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      const payload = {
        username:            profile.username || null,
        first_name:          profile.first_name || null,
        last_name:           profile.last_name || null,
        city:                profile.city || null,
        bio:                 profile.bio || null,
        profile_picture_url: profile.profile_picture_url || null,
        birthdate:           profile.birthdate || null,
        phone:               profile.phone || null,
      };
      const data = await apiUpdateMyProfile(payload);
      // keep current stats but refresh user fields
      setProfile((p) => ({ ...p, ...data.user }));
      setProfileToast("Profile saved");
      setTimeout(() => setProfileToast(null), 2000);
      // also sync the cached user in localStorage so Navbar greeting stays correct
      localStorage.setItem("user", JSON.stringify(data.user));
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

  return (
    <>
      <style>{PROFILE_CSS}</style>

      {/* NAVBAR */}
      <div className="bottom-navbar">
        <div className="bottom-item">
          <FiHome />
          <span>home</span>
        </div>

        <div className="bottom-item">
          <FiCompass />
          <span>explore</span>
        </div>

        <button
          className="bottom-item border-0 bg-transparent"
          onClick={() => setShowQuest(true)}
        >
          <FiPlus />
          <span>quest</span>
        </button>

        <div className="bottom-item">
          <FiMessageSquare />
          <span>inbox</span>
        </div>

        <button
          className="bottom-item border-0 bg-transparent"
          onClick={() => setShowProfile(true)}
        >
          <FiUser />
          <span>profile</span>
        </button>
      </div>

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
              {/* AVATAR */}
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
                <div className="text-secondary small mt-2">
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

                <Form.Label>Profile picture URL</Form.Label>
                <Form.Control
                  className="mb-3"
                  name="profile_picture_url"
                  value={profile.profile_picture_url || ""}
                  onChange={handleProfileChange}
                  placeholder="https://i.pravatar.cc/150?img=12"
                />

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
          QUEST MODAL  (cosmetic stub, unchanged)
      ===================================================== */}
      <Modal show={showQuest} onHide={() => setShowQuest(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create Quest</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Form>
            <Form.Control
              type="date"
              name="date"
              className="mb-2"
              onChange={handleQuestChange}
            />
            <Form.Control
              type="time"
              name="time"
              className="mb-2"
              onChange={handleQuestChange}
            />
            <Form.Control
              type="text"
              name="location"
              className="mb-2"
              placeholder="Location"
              onChange={handleQuestChange}
            />
            <Form.Control
              as="textarea"
              rows={3}
              name="details"
              className="mb-2"
              placeholder="Details"
              onChange={handleQuestChange}
            />
            <Form.Control
              type="file"
              className="mb-3"
              onChange={handleQuestImage}
            />

            <div>
              <strong>Invite friends</strong>
              {friends.map((f) => (
                <Form.Check
                  key={f.id}
                  type="checkbox"
                  label={`${f.name} (${f.username})`}
                  checked={eventData.invitedFriends.includes(f.id)}
                  onChange={() => toggleFriend(f.id)}
                />
              ))}
            </div>
          </Form>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowQuest(false)}>
            Cancel
          </Button>
          <Button onClick={createQuest}>Create</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
