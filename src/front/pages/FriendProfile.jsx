import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Badge,
  Spinner,
  Alert,
  ProgressBar,
  Modal,
} from "react-bootstrap";
import {
  FiArrowLeft,
  FiCalendar,
  FiUsers,
  FiActivity,
  FiMapPin,
  FiPhone,
  FiMail,
  FiUserPlus,
  FiUserCheck,
  FiUserX,
  FiTrash2,
  FiClock,
  FiMessageSquare,
} from "react-icons/fi";

// =============================================================
// INLINE API HELPERS
// =============================================================
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

const apiGetUserProfile = (userId) =>
  fetch(`${API}/api/profile/${userId}`, { headers: authHeaders() }).then(handle);

const apiSendRequest = (payload) =>
  fetch(`${API}/api/friends/requests`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  }).then(handle);

const apiAcceptRequest = (id) =>
  fetch(`${API}/api/friends/requests/${id}/accept`, {
    method: "PUT",
    headers: authHeaders(),
  }).then(handle);

const apiRefuseRequest = (id) =>
  fetch(`${API}/api/friends/requests/${id}/refuse`, {
    method: "PUT",
    headers: authHeaders(),
  }).then(handle);

const apiCancelRequest = (id) =>
  fetch(`${API}/api/friends/requests/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handle);

const apiUnfriend = (userId) =>
  fetch(`${API}/api/friends/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handle);

// Create a DM with this user, or return the existing one. The backend
// (/chat/dm) is idempotent: it returns the existing room if there is one,
// or creates a new room otherwise. Either way we get back room.id.
const apiCreateOrGetDm = (userId) =>
  fetch(`${API}/api/chat/dm`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId }),
  }).then(handle);

// =============================================================
// INLINE STYLES (reuses Friends page palette)
// =============================================================
const PROFILE_CSS = `
.friend-profile-page {
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99, 102, 241, 0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236, 72, 153, 0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef;
  padding-top: 80px;
}
.profile-card {
  background: #161922;
  border: 1px solid #262a36;
  border-radius: 14px;
  color: #e9ecef;
}
.profile-stat-box {
  background: #0f111a;
  border: 1px solid #262a36;
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
}
.profile-stat-box .stat-value { font-size: 1.6rem; font-weight: 700; color: #fff; }
.profile-stat-box .stat-label {
  font-size: 0.78rem;
  color: #adb5bd;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.profile-hero-avatar {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  border: 4px solid #6366f1;
  object-fit: cover;
  background: #0f111a;
}
.profile-hero-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #ec4899);
}
.activity-bar .progress { background: #0f111a; height: 14px; border-radius: 10px; }
.activity-bar .progress-bar { background: linear-gradient(90deg, #6366f1, #ec4899); }
.info-line { color: #adb5bd; }
.info-line svg { color: #6366f1; }
`;

// =============================================================
// HELPERS
// =============================================================
const initials = (user) => {
  if (!user) return "?";
  const f = (user.first_name || "").trim().charAt(0);
  const l = (user.last_name || "").trim().charAt(0);
  if (f || l) return `${f}${l}`.toUpperCase();
  return (user.username || "?").charAt(0).toUpperCase();
};

const fullName = (user) => {
  if (!user) return "";
  const n = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return n || user.username || "(no name)";
};

const levelColor = (level) => {
  if (level === "Very active") return "success";
  if (level === "Active") return "info";
  return "secondary";
};

// =============================================================
// MAIN
// =============================================================
export const FriendProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetUserProfile(userId);
      setProfile(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const showToast = (text, variant = "success") => {
    setToast({ text, variant });
    setTimeout(() => setToast(null), 2200);
  };

  // ---- actions ----
  const handleAdd = async () => {
    setBusy(true);
    try {
      await apiSendRequest({ user_id: profile.id });
      showToast("Friend request sent");
      await reload();
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    setBusy(true);
    try {
      await apiAcceptRequest(profile.friendship_id);
      showToast("Friend request accepted");
      await reload();
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(false);
    }
  };

  const handleRefuse = async () => {
    setBusy(true);
    try {
      await apiRefuseRequest(profile.friendship_id);
      showToast("Friend request refused");
      await reload();
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      await apiCancelRequest(profile.friendship_id);
      showToast("Friend request cancelled");
      await reload();
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(false);
    }
  };

  const handleUnfriend = async () => {
    setBusy(true);
    try {
      await apiUnfriend(profile.id);
      showToast("Friend removed");
      setConfirmRemove(false);
      await reload();
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(false);
    }
  };

  // Open the DM with this friend — creates it if it doesn't exist yet,
  // then jumps to the full chat page for that room.
  const handleMessage = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const data = await apiCreateOrGetDm(profile.id);
      const roomId = data?.room?.id;
      if (roomId) {
        navigate(`/messages/${roomId}`);
      } else {
        navigate("/messages");
      }
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(false);
    }
  };

  // =====================================================
  // RENDER
  // =====================================================
  const renderActionButton = () => {
    if (!profile) return null;
    const status = profile.friendship_status;
    const dir = profile.friendship_direction;

    if (status === "self") return null;

    if (status === "accepted") {
      return (
        <div className="d-flex gap-2 flex-wrap">
          <Button
            variant="primary"
            disabled={busy}
            onClick={handleMessage}
          >
            <FiMessageSquare className="me-1" /> Message
          </Button>
          <Button
            variant="outline-danger"
            disabled={busy}
            onClick={() => setConfirmRemove(true)}
          >
            <FiTrash2 className="me-1" /> Remove friend
          </Button>
        </div>
      );
    }

    if (status === "pending" && dir === "outgoing") {
      return (
        <Button variant="outline-warning" disabled={busy} onClick={handleCancel}>
          <FiClock className="me-1" /> Cancel request
        </Button>
      );
    }

    if (status === "pending" && dir === "incoming") {
      return (
        <div className="d-flex gap-2">
          <Button variant="success" disabled={busy} onClick={handleAccept}>
            <FiUserCheck className="me-1" /> Accept
          </Button>
          <Button variant="outline-danger" disabled={busy} onClick={handleRefuse}>
            <FiUserX className="me-1" /> Refuse
          </Button>
        </div>
      );
    }

    // none or refused
    return (
      <Button variant="primary" disabled={busy} onClick={handleAdd}>
        <FiUserPlus className="me-1" /> Add friend
      </Button>
    );
  };

  const stats = profile?.stats;

  return (
    <div className="friend-profile-page">
      <style>{PROFILE_CSS}</style>

      <Container className="py-5">
        {/* BACK BUTTON */}
        <div className="mb-3">
          <Button
            variant="outline-light"
            size="sm"
            onClick={() => navigate(-1)}
          >
            <FiArrowLeft className="me-1" /> Back
          </Button>{" "}
          <Link to="/friends" className="text-decoration-none ms-2 small text-secondary">
            or back to Friends
          </Link>
        </div>

        {toast && <Alert variant={toast.variant}>{toast.text}</Alert>}
        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}

        {loading && (
          <div className="text-center py-5 text-secondary">
            <Spinner animation="border" />
          </div>
        )}

        {!loading && profile && (
          <>
            {/* HERO */}
            <Card className="profile-card mb-4">
              <Card.Body>
                <Row className="align-items-center g-4">
                  <Col xs={12} md="auto" className="text-center">
                    {profile.profile_picture_url ? (
                      <img
                        src={profile.profile_picture_url}
                        alt="profile"
                        className="profile-hero-avatar"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    ) : (
                      <div className="profile-hero-avatar profile-hero-fallback">
                        {initials(profile)}
                      </div>
                    )}
                  </Col>
                  <Col>
                    <h1 className="text-light mb-1">{fullName(profile)}</h1>
                    {profile.username && (
                      <div className="text-secondary mb-2">@{profile.username}</div>
                    )}
                    {profile.bio && (
                      <p className="text-light mb-3">{profile.bio}</p>
                    )}

                    <div className="d-flex flex-wrap gap-3 small info-line mb-3">
                      {profile.city && (
                        <span><FiMapPin className="me-1" />{profile.city}</span>
                      )}
                      {profile.email && (
                        <span><FiMail className="me-1" />{profile.email}</span>
                      )}
                      {profile.phone && (
                        <span><FiPhone className="me-1" />{profile.phone}</span>
                      )}
                    </div>

                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      {profile.friendship_status === "accepted" && (
                        <Badge bg="success">Friends</Badge>
                      )}
                      {profile.friendship_status === "pending" && (
                        <Badge bg="warning" text="dark">
                          {profile.friendship_direction === "outgoing"
                            ? "Request sent"
                            : "Awaiting your reply"}
                        </Badge>
                      )}
                      {profile.friendship_status === "refused" && (
                        <Badge bg="secondary">Previously refused</Badge>
                      )}
                      {renderActionButton()}
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* STATS */}
            <Row className="g-3 mb-4">
              <Col xs={6} md={4}>
                <div className="profile-stat-box">
                  <FiCalendar size={22} className="text-info mb-1" />
                  <div className="stat-value">{stats?.events_created_count ?? 0}</div>
                  <div className="stat-label">Created</div>
                </div>
              </Col>
              <Col xs={6} md={4}>
                <div className="profile-stat-box">
                  <FiUsers size={22} className="text-warning mb-1" />
                  <div className="stat-value">{stats?.events_participated_count ?? 0}</div>
                  <div className="stat-label">Participated</div>
                </div>
              </Col>
              <Col xs={12} md={4}>
                <div className="profile-stat-box">
                  <FiActivity size={22} className="text-success mb-1" />
                  <div className="stat-value">{stats?.activity_avg_per_week ?? 0}</div>
                  <div className="stat-label">Events / week</div>
                </div>
              </Col>
            </Row>

            {/* ACTIVITY BAR */}
            <Card className="profile-card mb-4">
              <Card.Body className="activity-bar">
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
              </Card.Body>
            </Card>
          </>
        )}
      </Container>

      {/* CONFIRM UNFRIEND */}
      <Modal
        show={confirmRemove}
        onHide={() => setConfirmRemove(false)}
        centered
        contentClassName="bg-dark text-light border border-secondary"
      >
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title>Remove friend?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Remove <strong>{fullName(profile)}</strong> from your friends? You will
          need to send a new request to reconnect.
        </Modal.Body>
        <Modal.Footer className="border-secondary">
          <Button variant="outline-light" onClick={() => setConfirmRemove(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleUnfriend} disabled={busy}>
            <FiTrash2 className="me-1" /> Remove
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default FriendProfile;
