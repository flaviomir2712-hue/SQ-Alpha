import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Container, Card, Button, Spinner, Badge, Alert } from "react-bootstrap";
import { FiUsers, FiBriefcase, FiCheckCircle } from "react-icons/fi";

// =============================================================
// TeamInvite — Phase 5b, route /team/invite/:token
// Preview an invite (company + role) and accept it. Requires a session;
// if the visitor isn't logged in we point them to /login first.
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

const ROLE_LABEL = { manager: "Manager", editor: "Editor", viewer: "Viewer" };

const CSS = `
.team-invite-page {
  min-height: 100dvh;
  background:
    radial-gradient(1000px 500px at 50% -10%, rgba(99,102,241,0.18), transparent 60%),
    #0b0d12;
  color: #e9ecef;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.team-invite-card {
  background: #161922; border: 1px solid #262a36; border-radius: 16px;
  max-width: 440px; width: 100%; color: #e9ecef;
}
`;

const isLogged = () => !!localStorage.getItem("user");

export const TeamInvite = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [info, setInfo]       = useState(null);
  const [err, setErr]         = useState(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined]   = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/team/invites/${token}`, { headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
        setInfo(data);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const accept = async () => {
    setJoining(true);
    setErr(null);
    try {
      await fetch(`${API}/api/team/invites/${token}/accept`, {
        method: "POST", headers: authHeaders(),
      }).then(handle);
      setJoined(true);
      setTimeout(() => navigate("/manage"), 1200);
    } catch (e) {
      setErr(e.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="team-invite-page">
      <style>{CSS}</style>
      <Card className="team-invite-card">
        <Card.Body className="p-4 text-center">
          <div className="mb-3" style={{ fontSize: 40, color: "#6366f1" }}>
            <FiUsers />
          </div>

          {loading ? (
            <Spinner animation="border" />
          ) : err ? (
            <>
              <h5 className="text-light">Invalid invite</h5>
              <p className="text-secondary small">{err}</p>
              <Link to="/app"><Button variant="outline-light">Go to the app</Button></Link>
            </>
          ) : joined ? (
            <>
              <div style={{ fontSize: 40, color: "#34d399" }}><FiCheckCircle /></div>
              <h5 className="text-light mt-2">You joined the team!</h5>
              <p className="text-secondary small">Redirecting to Manage…</p>
            </>
          ) : (
            <>
              <h5 className="text-light mb-1">Team invitation</h5>
              <p className="text-secondary mb-3">
                <FiBriefcase className="me-1" />
                <strong>{info?.business_name || "A company"}</strong> invites you as{" "}
                <Badge bg="info">{ROLE_LABEL[info?.role] || info?.role}</Badge>
              </p>

              {!info?.valid && (
                <Alert variant="warning" className="small">
                  This invite is no longer valid (expired, used or revoked).
                </Alert>
              )}

              {!isLogged() ? (
                <>
                  <p className="text-secondary small">Sign in to join with your account.</p>
                  <Link to="/login"><Button variant="primary">Sign in</Button></Link>
                </>
              ) : (
                <Button variant="primary" onClick={accept} disabled={joining || !info?.valid}>
                  {joining ? <Spinner size="sm" animation="border" /> : "Join the team"}
                </Button>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default TeamInvite;
