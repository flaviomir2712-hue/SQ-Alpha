import { useEffect, useState } from "react";
import { Modal, Button, Form, Spinner, Badge, InputGroup } from "react-bootstrap";
import {
  FiUsers,
  FiUserPlus,
  FiTrash2,
  FiLink,
  FiCopy,
  FiStar,
  FiShield,
} from "react-icons/fi";

// =============================================================
// TeamManager — Phase 5b. Per-company team management (Badakan-like).
// Lists members + role, lets owner/manager invite (single-use link or by
// email/username), change roles, grant the owner-only co-management
// authorization, and remove members. Consumes /businesses/<id>/team*.
// Dark theme: global .sq-modal + a scoped style block.
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

const apiGetTeam      = (bid) => fetch(`${API}/api/businesses/${bid}/team`, { headers: authHeaders() }).then(handle);
const apiInvite       = (bid, body) => fetch(`${API}/api/businesses/${bid}/team/invites`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) }).then(handle);
const apiUpdateMember = (bid, uid, body) => fetch(`${API}/api/businesses/${bid}/team/${uid}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) }).then(handle);
const apiRemoveMember = (bid, uid) => fetch(`${API}/api/businesses/${bid}/team/${uid}`, { method: "DELETE", headers: authHeaders() }).then(handle);
const apiRevokeInvite = (bid, iid) => fetch(`${API}/api/businesses/${bid}/team/invites/${iid}`, { method: "DELETE", headers: authHeaders() }).then(handle);

const ROLE_BADGE = {
  owner:   { bg: "primary",   label: "Owner" },
  manager: { bg: "info",      label: "Manager" },
  editor:  { bg: "success",   label: "Editor" },
  viewer:  { bg: "secondary", label: "Viewer" },
};

const CSS = `
.sq-modal .modal-content{background:#161922;color:#e9ecef;border:1px solid #262a36;border-radius:14px;}
.sq-modal .modal-header,.sq-modal .modal-footer{border-color:#262a36;}
.sq-modal .form-control,.sq-modal .form-select,.sq-modal .form-control:focus,.sq-modal .form-select:focus{background-color:#0f111a!important;color:#e9ecef!important;border-color:#2a2f42!important;box-shadow:none;}
.sq-modal .form-control::placeholder{color:#6c757d;}
.sq-modal .btn-close{filter:invert(1) grayscale(1) brightness(2);}
.sq-team-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0; border-bottom: 1px solid #262a36;
}
.sq-team-avatar {
  width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
  border: 1px solid #262a36; background: #1e2230; flex-shrink: 0;
}
.sq-team-name { color: #e9ecef; font-weight: 600; font-size: 0.9rem; }
.sq-team-invite-box {
  background: #0f111a; border: 1px solid #262a36; border-radius: 10px;
  padding: 0.75rem; margin-top: 0.5rem;
}
.sq-team-link { word-break: break-all; font-size: 0.78rem; color: #9aa4b2; }
`;

const myId = () => {
  try { return (JSON.parse(localStorage.getItem("user") || "null") || {}).id; }
  catch { return null; }
};

export const TeamManager = ({ businessId, businessName, show, onHide }) => {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [myRole, setMyRole]   = useState(null);
  const [err, setErr]         = useState(null);

  // invite form
  const [inviteRole, setInviteRole]   = useState("viewer");
  const [inviteTarget, setInviteTarget] = useState("");   // email or username, empty = open link
  const [inviting, setInviting]       = useState(false);
  const [lastLink, setLastLink]       = useState(null);
  const [copied, setCopied]           = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGetTeam(businessId);
      setMembers(data.members || []);
      setInvites(data.pending_invites || []);
      setMyRole(data.my_role || null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (show && businessId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, businessId]);

  const meRow = members.find((m) => m.user_id === myId());
  const canManage = myRole === "owner" || myRole === "manager";
  const canManageManagers = myRole === "owner" || !!(meRow && meRow.can_manage_managers);
  const isOwnerMe = myRole === "owner";

  const canActOn = (m) => {
    if (m.role === "owner") return false;            // owner is untouchable
    if (m.user_id === myId()) return false;          // don't manage yourself here
    if (m.role === "manager") return canManageManagers;
    return canManage;                                // editor / viewer
  };

  const createInvite = async () => {
    setInviting(true);
    setErr(null);
    setLastLink(null);
    setCopied(false);
    try {
      const body = { role: inviteRole };
      const t = inviteTarget.trim();
      if (t) {
        if (t.startsWith("@")) body.username = t.slice(1);
        else if (t.includes("@")) body.email = t;
        else body.username = t;
      }
      const data = await apiInvite(businessId, body);
      setInviteTarget("");
      setLastLink(data.invite?.accept_url || null);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (m, role) => {
    try { await apiUpdateMember(businessId, m.user_id, { role }); load(); }
    catch (e) { setErr(e.message); }
  };

  const toggleCoManage = async (m) => {
    try { await apiUpdateMember(businessId, m.user_id, { can_manage_managers: !m.can_manage_managers }); load(); }
    catch (e) { setErr(e.message); }
  };

  const removeMember = async (m) => {
    if (!window.confirm(`Remove @${m.username} from the team?`)) return;
    try { await apiRemoveMember(businessId, m.user_id); load(); }
    catch (e) { setErr(e.message); }
  };

  const revoke = async (inv) => {
    try { await apiRevokeInvite(businessId, inv.id); load(); }
    catch (e) { setErr(e.message); }
  };

  const copyLink = async () => {
    if (!lastLink) return;
    try { await navigator.clipboard.writeText(lastLink); setCopied(true); } catch { /* noop */ }
  };

  const roleBadge = (role) => {
    const b = ROLE_BADGE[role] || ROLE_BADGE.viewer;
    return <Badge bg={b.bg}>{b.label}</Badge>;
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg" className="sq-modal">
      <style>{CSS}</style>
      <Modal.Header closeButton closeVariant="white">
        <Modal.Title>
          <FiUsers className="me-2" /> Team {businessName ? `· ${businessName}` : ""}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {err && <div className="text-danger small mb-2">{err}</div>}

        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" /></div>
        ) : (
          <>
            {/* ── Members ── */}
            <div className="text-secondary text-uppercase small fw-semibold mb-1">
              Members ({members.length})
            </div>
            {members.map((m) => (
              <div className="sq-team-row" key={m.user_id}>
                {m.profile_picture_url ? (
                  <img className="sq-team-avatar" src={m.profile_picture_url} alt={m.username} />
                ) : (
                  <div className="sq-team-avatar d-flex align-items-center justify-content-center text-light" style={{ fontWeight: 700 }}>
                    {(m.username || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="sq-team-name text-truncate">@{m.username || "—"}</div>
                  <div className="d-flex align-items-center gap-2 mt-1">
                    {roleBadge(m.role)}
                    {m.role === "manager" && m.can_manage_managers && (
                      <span className="small" style={{ color: "#8ab4f8" }}>
                        <FiShield size={12} /> co-manage
                      </span>
                    )}
                  </div>
                </div>

                {canActOn(m) && (
                  <div className="d-flex align-items-center gap-2">
                    <Form.Select
                      size="sm"
                      value={m.role}
                      onChange={(e) => changeRole(m, e.target.value)}
                      style={{ width: 120 }}
                    >
                      <option value="manager">Manager</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </Form.Select>
                    {isOwnerMe && m.role === "manager" && (
                      <Form.Check
                        type="switch"
                        id={`comanage-${m.user_id}`}
                        title="Co-management (manage other managers)"
                        checked={!!m.can_manage_managers}
                        onChange={() => toggleCoManage(m)}
                      />
                    )}
                    <Button variant="outline-danger" size="sm" onClick={() => removeMember(m)} title="Remove">
                      <FiTrash2 />
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {/* ── Pending invites ── */}
            {canManage && invites.length > 0 && (
              <>
                <div className="text-secondary text-uppercase small fw-semibold mt-3 mb-1">
                  Pending invites ({invites.length})
                </div>
                {invites.map((inv) => (
                  <div className="sq-team-row" key={inv.id}>
                    <FiLink className="text-secondary" />
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="small text-truncate">
                        {inv.targeted
                          ? (inv.invited_username ? `@${inv.invited_username}` : inv.email)
                          : "Open link (single-use)"}
                        {" · "}{roleBadge(inv.role)}
                      </div>
                    </div>
                    <Button variant="outline-secondary" size="sm" onClick={() => revoke(inv)}>
                      Revoke
                    </Button>
                  </div>
                ))}
              </>
            )}

            {/* ── Invite form (owner / manager) ── */}
            {canManage && (
              <div className="sq-team-invite-box">
                <div className="text-secondary text-uppercase small fw-semibold mb-2">
                  <FiUserPlus className="me-1" /> Invite to the team
                </div>
                <div className="d-flex gap-2 flex-wrap align-items-end">
                  <div>
                    <Form.Label className="small text-secondary mb-1">Role</Form.Label>
                    <Form.Select
                      size="sm"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      style={{ width: 130 }}
                    >
                      <option value="manager">Manager</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </Form.Select>
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 180 }}>
                    <Form.Label className="small text-secondary mb-1">
                      Email or username <span className="text-secondary">(empty = open link)</span>
                    </Form.Label>
                    <Form.Control
                      size="sm"
                      value={inviteTarget}
                      onChange={(e) => setInviteTarget(e.target.value)}
                      placeholder="email / @username / empty"
                    />
                  </div>
                  <Button variant="primary" size="sm" onClick={createInvite} disabled={inviting}>
                    {inviting ? <Spinner size="sm" animation="border" /> : <><FiStar className="me-1" /> Create invite</>}
                  </Button>
                </div>

                {lastLink && (
                  <div className="mt-3">
                    <div className="small text-secondary mb-1">
                      Invite link (single-use). Share it with your teammate:
                    </div>
                    <InputGroup size="sm">
                      <Form.Control className="sq-team-link" value={lastLink} readOnly />
                      <Button variant="outline-light" onClick={copyLink}>
                        <FiCopy className="me-1" /> {copied ? "Copied" : "Copy"}
                      </Button>
                    </InputGroup>
                  </div>
                )}
              </div>
            )}

            {!canManage && (
              <div className="small text-secondary mt-3">
                You're a <strong>{myRole}</strong> of this team: you can see the
                members, but only the owner or a manager can invite or change roles.
              </div>
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-light" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TeamManager;
