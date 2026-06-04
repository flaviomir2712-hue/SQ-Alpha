import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
  Form,
} from "react-bootstrap";
import {
  FiEdit2,
  FiLogOut,
  FiSave,
  FiX,
  FiImage,
  FiMapPin,
  FiMail,
  FiPhone,
  FiCalendar,
  FiUsers,
  FiActivity,
  FiUser,
  FiCake,
} from "react-icons/fi";

// =============================================================
// INLINE API
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

const apiGetMyProfile = () =>
  fetch(`${API}/api/profile/me`, { headers: authHeaders() }).then(handle);

const apiUpdateMyProfile = (body) =>
  fetch(`${API}/api/profile/me`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  }).then(handle);

// =============================================================
// INLINE STYLES (dark, coherent with FriendProfile / EventModal)
// =============================================================
const PROFILE_CSS = `
.my-profile-page {
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

/* Edit modal — same skin as EventModal */
.profile-edit-modal .modal-content {
  background: #161922; color: #e9ecef;
  border: 1px solid #262a36; border-radius: 14px;
}
.profile-edit-modal .modal-header,
.profile-edit-modal .modal-footer { border-color: #262a36; }
.profile-edit-modal .form-control,
.profile-edit-modal .form-select,
.profile-edit-modal .form-control:focus {
  background-color: #0f111a !important;
  color: #e9ecef !important;
  border-color: #2a2f42 !important;
  box-shadow: none;
}
.profile-edit-modal .form-control::placeholder { color: #6c757d; }
.profile-edit-modal .form-label {
  color: #adb5bd;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.profile-edit-photo {
  width: 120px; height: 120px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #6366f1;
  background: #0f111a;
}
.profile-edit-photo-fallback {
  width: 120px; height: 120px;
  border-radius: 50%;
  border: 3px dashed #2a2f42;
  display: flex; align-items: center; justify-content: center;
  color: #6c757d;
  background: #0f111a;
}
`;

// =============================================================
// HELPERS
// =============================================================
const initials = (user) => {
  if (!user) return "?";
  const f = (user.first_name || "").trim().charAt(0);
  const l = (user.last_name || "").trim().charAt(0);
  if (f || l) return `${f}${l}`.toUpperCase();
  return (user.username || user.email || "?").charAt(0).toUpperCase();
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

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// =============================================================
// MAIN
// =============================================================
export const Profile = () => {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // edit modal
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: "",
    first_name: "",
    last_name: "",
    city: "",
    bio: "",
    birthdate: "",
    phone: "",
    profile_picture_url: "",
  });
  const fileInputRef = useRef(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetMyProfile();
      setProfile(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const showToast = (text, variant = "success") => {
    setToast({ text, variant });
    setTimeout(() => setToast(null), 2200);
  };

  // ----- edit handlers -----
  const openEdit = () => {
    if (!profile) return;
    setForm({
      username:            profile.username            || "",
      first_name:          profile.first_name          || "",
      last_name:           profile.last_name           || "",
      city:                profile.city                || "",
      bio:                 profile.bio                 || "",
      birthdate:           profile.birthdate           || "",
      phone:               profile.phone               || "",
      profile_picture_url: profile.profile_picture_url || "",
    });
    setEditing(true);
  };

  const closeEdit = () => {
    setEditing(false);
  };

  const handleField = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handlePickPhoto = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      showToast("Image too large (max 1.5 MB)", "danger");
      return;
    }
    try {
      const b64 = await fileToBase64(file);
      setForm((f) => ({ ...f, profile_picture_url: b64 }));
    } catch {
      showToast("Failed to read file", "danger");
    }
  };

  const removePhoto = () => {
    setForm((f) => ({ ...f, profile_picture_url: "" }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await apiUpdateMyProfile({
        username:            form.username || null,
        first_name:          form.first_name || null,
        last_name:           form.last_name || null,
        city:                form.city || null,
        bio:                 form.bio || null,
        birthdate:           form.birthdate || null,
        phone:               form.phone || null,
        profile_picture_url: form.profile_picture_url || null,
      });
      setProfile((p) => ({ ...p, ...data.user }));
      // keep stats already on-screen, just refresh full profile to be safe
      reload();
      showToast("Profile updated");
      closeEdit();
    } catch (e) {
      showToast(e.message || "Failed to save", "danger");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  // =====================================================
  // RENDER
  // =====================================================
  const stats = profile?.stats;

  return (
    <div className="my-profile-page">
      <style>{PROFILE_CSS}</style>

      <Container className="py-5">
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
                      {profile.birthdate && (
                        <span><FiCake className="me-1" />{profile.birthdate}</span>
                      )}
                    </div>

                    <div className="d-flex gap-2 flex-wrap">
                      <Button variant="primary" onClick={openEdit}>
                        <FiEdit2 className="me-1" /> Editar perfil
                      </Button>
                      <Link to="/friends">
                        <Button variant="outline-light">
                          <FiUsers className="me-1" /> Mis amigos
                        </Button>
                      </Link>
                      <Link to="/events">
                        <Button variant="outline-light">
                          <FiCalendar className="me-1" /> Mis eventos
                        </Button>
                      </Link>
                      <Button variant="outline-danger" onClick={handleLogout}>
                        <FiLogOut className="me-1" /> Salir
                      </Button>
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

      {/* EDIT MODAL */}
      <Modal
        show={editing}
        onHide={closeEdit}
        centered
        size="lg"
        dialogClassName="profile-edit-modal"
      >
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title className="d-flex align-items-center gap-2">
            <FiEdit2 /> Editar perfil
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Row className="g-3">

            {/* PHOTO UPLOADER */}
            <Col xs={12} className="text-center">
              <Form.Label>Foto de perfil</Form.Label>
              <div className="d-flex flex-column align-items-center gap-2">
                {form.profile_picture_url ? (
                  <img
                    src={form.profile_picture_url}
                    alt="profile preview"
                    className="profile-edit-photo"
                  />
                ) : (
                  <div className="profile-edit-photo-fallback">
                    <FiUser size={36} />
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  style={{ display: "none" }}
                />

                <div className="d-flex gap-2">
                  <Button
                    variant="outline-light"
                    size="sm"
                    onClick={handlePickPhoto}
                  >
                    <FiImage className="me-1" />
                    {form.profile_picture_url ? "Cambiar foto" : "Subir foto"}
                  </Button>
                  {form.profile_picture_url && (
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={removePhoto}
                    >
                      <FiX className="me-1" /> Quitar
                    </Button>
                  )}
                </div>
                <small className="text-secondary">
                  Desde tu dispositivo · max 1.5 MB
                </small>
              </div>
            </Col>

            <Col md={6}>
              <Form.Label>Username</Form.Label>
              <Form.Control
                name="username"
                value={form.username}
                onChange={handleField}
                placeholder="username único"
              />
            </Col>

            <Col md={6}>
              <Form.Label>Email</Form.Label>
              <Form.Control
                value={profile?.email || ""}
                disabled
                placeholder="—"
              />
              <small className="text-secondary">No editable</small>
            </Col>

            <Col md={6}>
              <Form.Label>First name</Form.Label>
              <Form.Control
                name="first_name"
                value={form.first_name}
                onChange={handleField}
              />
            </Col>

            <Col md={6}>
              <Form.Label>Last name</Form.Label>
              <Form.Control
                name="last_name"
                value={form.last_name}
                onChange={handleField}
              />
            </Col>

            <Col md={6}>
              <Form.Label><FiMapPin className="me-1" /> Ciudad</Form.Label>
              <Form.Control
                name="city"
                value={form.city}
                onChange={handleField}
              />
            </Col>

            <Col md={6}>
              <Form.Label><FiPhone className="me-1" /> Teléfono</Form.Label>
              <Form.Control
                name="phone"
                value={form.phone}
                onChange={handleField}
              />
            </Col>

            <Col md={6}>
              <Form.Label><FiCake className="me-1" /> Fecha de nacimiento</Form.Label>
              <Form.Control
                type="date"
                name="birthdate"
                value={form.birthdate}
                onChange={handleField}
              />
            </Col>

            <Col xs={12}>
              <Form.Label>Bio</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="bio"
                value={form.bio}
                onChange={handleField}
                placeholder="Cuenta algo sobre ti..."
              />
            </Col>
          </Row>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="outline-light" onClick={closeEdit} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? <Spinner animation="border" size="sm" />
              : <><FiSave className="me-1" /> Guardar</>
            }
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Profile;
