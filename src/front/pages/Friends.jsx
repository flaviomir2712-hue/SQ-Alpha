import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  InputGroup,
  Badge,
  Tabs,
  Tab,
  Spinner,
  Alert,
  ListGroup,
  Modal,
} from "react-bootstrap";
import {
  FiUserPlus,
  FiUserCheck,
  FiUserX,
  FiUsers,
  FiSearch,
  FiTrash2,
  FiSend,
  FiClock,
  FiInbox,
} from "react-icons/fi";

import useGlobalReducer from "../hooks/useGlobalReducer";

// =============================================================
// API HELPERS (inlined — no external service file needed)
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

const apiFetchFriends = () =>
  fetch(`${API}/api/friends`, { headers: authHeaders() }).then(handle);

const apiFetchRequests = (direction = "incoming") =>
  fetch(`${API}/api/friends/requests?direction=${direction}`, {
    headers: authHeaders(),
  }).then(handle);

const apiSendRequest = (payload) =>
  fetch(`${API}/api/friends/requests`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  }).then(handle);

const apiAcceptRequest = (requestId) =>
  fetch(`${API}/api/friends/requests/${requestId}/accept`, {
    method: "PUT",
    headers: authHeaders(),
  }).then(handle);

const apiRefuseRequest = (requestId) =>
  fetch(`${API}/api/friends/requests/${requestId}/refuse`, {
    method: "PUT",
    headers: authHeaders(),
  }).then(handle);

const apiCancelRequest = (requestId) =>
  fetch(`${API}/api/friends/requests/${requestId}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handle);

const apiUnfriend = (userId) =>
  fetch(`${API}/api/friends/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handle);

const apiSearchUsers = (q) =>
  fetch(`${API}/api/friends/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(),
  }).then(handle);

// =============================================================
// INLINE STYLES (no external CSS file needed)
// =============================================================
const FRIENDS_CSS = `
.friends-page {
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99, 102, 241, 0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236, 72, 153, 0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef;
  padding-top: 80px;
}
.friends-card {
  background: #161922;
  border: 1px solid #262a36;
  border-radius: 14px;
  color: #e9ecef;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.friends-card:hover {
  border-color: #3a3f55;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  transform: translateY(-2px);
}
.friends-page .form-control,
.friends-page .form-control:focus {
  background-color: #0f111a !important;
  color: #e9ecef !important;
  border-color: #2a2f42 !important;
  box-shadow: none;
}
.friends-page .form-control::placeholder { color: #6c757d; }
.friends-tabs { border-bottom: 1px solid #262a36; }
.friends-tabs .nav-link {
  color: #adb5bd;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.85rem 1rem;
  font-weight: 500;
}
.friends-tabs .nav-link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.03);
}
.friends-tabs .nav-link.active {
  color: #fff;
  background: transparent;
  border-bottom: 2px solid #6366f1;
}
.friends-page .list-group-item { padding: 1rem 1.25rem; }
.friends-page .min-w-0 { min-width: 0; }
.friends-card-clickable { cursor: pointer; }
.friends-card-clickable .stretched-link::after {
  border-radius: 14px;
}
.friend-row-link {
  color: inherit;
  text-decoration: none;
  flex: 1;
  min-width: 0;
}
.friend-row-link:hover { color: #fff; }
`;

// =============================================================
// HELPERS
// =============================================================
const initials = (email = "") =>
  email
    .split("@")[0]
    .split(/[._-]/)
    .map((s) => s.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2) || "?";

const avatarStyle = (seed) => ({
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: `linear-gradient(135deg, hsl(${seed % 360},70%,40%), hsl(${(seed * 7) % 360},70%,25%))`,
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  flexShrink: 0,
});

// =============================================================
// MAIN COMPONENT
// =============================================================
export const Friends = () => {
  const { store, dispatch } = useGlobalReducer();
  const [tab, setTab] = useState("friends");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // ---- initial load ----
  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [friends, incoming, outgoing] = await Promise.all([
        apiFetchFriends(),
        apiFetchRequests("incoming"),
        apiFetchRequests("outgoing"),
      ]);
      dispatch({ type: "set_friends", payload: friends });
      dispatch({ type: "set_incoming_requests", payload: incoming });
      dispatch({ type: "set_outgoing_requests", payload: outgoing });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- debounced search ----
  useEffect(() => {
    if (searchQ.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await apiSearchUsers(searchQ.trim());
        setSearchResults(r);
      } catch (e) {
        setError(e.message);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  const showToast = (text, variant = "success") => {
    setToast({ text, variant });
    setTimeout(() => setToast(null), 2500);
  };

  // ---- actions ----
  const handleSend = async (target) => {
    setBusy(`send-${target.id}`);
    try {
      const { friendship } = await apiSendRequest({ user_id: target.id });
      dispatch({ type: "add_outgoing_request", payload: friendship });
      showToast(`Request sent to ${target.email}`);
      setSearchResults((rs) =>
        rs.map((r) =>
          r.id === target.id
            ? { ...r, status: "pending", direction: "outgoing", friendship_id: friendship.id }
            : r
        )
      );
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(null);
    }
  };

  const handleAccept = async (req) => {
    setBusy(`acc-${req.id}`);
    try {
      const { friendship } = await apiAcceptRequest(req.id);
      dispatch({ type: "remove_incoming_request", payload: req.id });
      dispatch({ type: "add_friend", payload: friendship });
      showToast(`You are now friends with ${req.friend.email}`);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(null);
    }
  };

  const handleRefuse = async (req) => {
    setBusy(`ref-${req.id}`);
    try {
      await apiRefuseRequest(req.id);
      dispatch({ type: "remove_incoming_request", payload: req.id });
      showToast(`Request from ${req.friend.email} refused`);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async (req) => {
    setBusy(`can-${req.id}`);
    try {
      await apiCancelRequest(req.id);
      dispatch({ type: "remove_outgoing_request", payload: req.id });
      showToast(`Request to ${req.friend.email} cancelled`);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(null);
    }
  };

  const handleUnfriend = async () => {
    if (!confirmRemove) return;
    const target = confirmRemove;
    setBusy(`del-${target.friend.id}`);
    try {
      await apiUnfriend(target.friend.id);
      dispatch({ type: "remove_friend", payload: target.friend.id });
      showToast(`${target.friend.email} removed from friends`);
    } catch (e) {
      showToast(e.message, "danger");
    } finally {
      setBusy(null);
      setConfirmRemove(null);
    }
  };

  // ---- derived ----
  const incomingCount = store.incomingRequests?.length || 0;
  const friendsCount = store.friends?.length || 0;
  const outgoingCount = store.outgoingRequests?.length || 0;

  const filteredFriends = useMemo(() => {
    if (!searchQ || tab !== "friends") return store.friends || [];
    const q = searchQ.toLowerCase();
    return (store.friends || []).filter((f) =>
      f.friend?.email?.toLowerCase().includes(q)
    );
  }, [store.friends, searchQ, tab]);

  // ----------------------------------------------------------------------
  return (
    <div className="friends-page">
      <style>{FRIENDS_CSS}</style>

      <Container className="py-5">
        {/* HEADER */}
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-light mb-1 d-flex align-items-center gap-2">
              <FiUsers /> Friends
            </h1>
            <p className="text-secondary mb-0">
              Manage your connections, requests and find new people.
            </p>
          </div>
          <Button variant="outline-light" onClick={reload} disabled={loading}>
            {loading ? <Spinner size="sm" animation="border" /> : "Refresh"}
          </Button>
        </div>

        {/* TOAST */}
        {toast && (
          <Alert variant={toast.variant} className="shadow-sm">
            {toast.text}
          </Alert>
        )}

        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}

        {/* SEARCH BAR */}
        <Card className="friends-card mb-4">
          <Card.Body>
            <InputGroup>
              <InputGroup.Text className="bg-dark border-secondary text-light">
                <FiSearch />
              </InputGroup.Text>
              <Form.Control
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search people by email (min. 2 chars)..."
                className="bg-dark border-secondary text-light"
              />
              {searchQ && (
                <Button variant="outline-secondary" onClick={() => setSearchQ("")}>
                  Clear
                </Button>
              )}
            </InputGroup>

            {/* search results — visible on every tab */}
            {searchQ.trim().length >= 2 && (
              <div className="mt-3">
                <div className="small text-uppercase text-secondary mb-2 fw-semibold">
                  People found
                </div>
                {searching ? (
                  <div className="text-secondary small d-flex align-items-center gap-2">
                    <Spinner animation="border" size="sm" /> Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-secondary small">No matches.</div>
                ) : (
                  <ListGroup variant="flush">
                    {searchResults.map((u) => (
                      <ListGroup.Item
                        key={u.id}
                        className="bg-transparent text-light border-secondary d-flex justify-content-between align-items-center"
                      >
                        <div className="d-flex align-items-center gap-3">
                          <div style={avatarStyle(u.id)}>{initials(u.email)}</div>
                          <div>
                            <div className="fw-semibold">{u.email}</div>
                            <div className="small text-secondary">
                              {u.status === "none" && "Not connected"}
                              {u.status === "pending" &&
                                (u.direction === "outgoing"
                                  ? "Request sent"
                                  : "Wants to be your friend")}
                              {u.status === "accepted" && "Already friends"}
                              {u.status === "refused" && "Previously refused"}
                            </div>
                          </div>
                        </div>
                        <div>
                          {u.status === "none" || u.status === "refused" ? (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy === `send-${u.id}`}
                              onClick={() => handleSend(u)}
                            >
                              <FiUserPlus className="me-1" /> Add
                            </Button>
                          ) : u.status === "pending" && u.direction === "outgoing" ? (
                            <Badge bg="warning" text="dark">
                              <FiClock className="me-1" /> Pending
                            </Badge>
                          ) : u.status === "pending" && u.direction === "incoming" ? (
                            <Badge bg="info">Awaiting your reply</Badge>
                          ) : (
                            <Badge bg="success">Friends</Badge>
                          )}
                        </div>
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                )}
              </div>
            )}
          </Card.Body>
        </Card>

        {/* TABS */}
        <Tabs
          activeKey={tab}
          onSelect={(k) => setTab(k)}
          className="friends-tabs mb-3"
          fill
        >
          <Tab
            eventKey="friends"
            title={
              <span>
                <FiUsers className="me-1" /> Friends{" "}
                <Badge bg="secondary">{friendsCount}</Badge>
              </span>
            }
          >
            {loading ? (
              <LoadingBlock />
            ) : filteredFriends.length === 0 ? (
              <EmptyState
                icon={<FiUsers size={42} />}
                title="No friends yet"
                hint="Search for a user above to send your first request."
              />
            ) : (
              <Row className="g-3 mt-1">
                {filteredFriends.map((f) => (
                  <Col md={6} lg={4} key={f.id}>
                    <Card className="friends-card friends-card-clickable h-100">
                      <Card.Body className="d-flex align-items-center gap-3 position-relative">
                        {/* Full-card link (sits behind the Remove button) */}
                        <Link
                          to={`/friends/${f.friend.id}`}
                          className="stretched-link"
                          aria-label={`Open ${f.friend.email}'s profile`}
                        />
                        <div style={avatarStyle(f.friend.id)}>
                          {initials(f.friend.email)}
                        </div>
                        <div className="flex-grow-1 min-w-0">
                          <div className="text-light fw-semibold text-truncate">
                            {f.friend.email}
                          </div>
                          <div className="small text-secondary">
                            Friends since{" "}
                            {new Date(f.updated_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          disabled={busy === `del-${f.friend.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setConfirmRemove(f);
                          }}
                          title="Remove friend"
                          className="position-relative"
                          style={{ zIndex: 2 }}
                        >
                          <FiTrash2 />
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Tab>

          <Tab
            eventKey="incoming"
            title={
              <span>
                <FiInbox className="me-1" /> Incoming{" "}
                <Badge bg={incomingCount ? "danger" : "secondary"}>
                  {incomingCount}
                </Badge>
              </span>
            }
          >
            {loading ? (
              <LoadingBlock />
            ) : incomingCount === 0 ? (
              <EmptyState
                icon={<FiInbox size={42} />}
                title="No incoming requests"
                hint="When someone sends you a request, it will appear here."
              />
            ) : (
              <ListGroup className="mt-2">
                {store.incomingRequests.map((req) => (
                  <ListGroup.Item
                    key={req.id}
                    className="bg-transparent border-secondary text-light d-flex justify-content-between align-items-center flex-wrap gap-2"
                  >
                    <Link to={`/friends/${req.friend.id}`} className="friend-row-link d-flex align-items-center gap-3">
                      <div style={avatarStyle(req.friend.id)}>
                        {initials(req.friend.email)}
                      </div>
                      <div>
                        <div className="fw-semibold">{req.friend.email}</div>
                        <div className="small text-secondary">
                          Sent {new Date(req.created_at).toLocaleString()}
                        </div>
                      </div>
                    </Link>
                    <div className="d-flex gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        disabled={busy === `acc-${req.id}`}
                        onClick={() => handleAccept(req)}
                      >
                        <FiUserCheck className="me-1" /> Accept
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        disabled={busy === `ref-${req.id}`}
                        onClick={() => handleRefuse(req)}
                      >
                        <FiUserX className="me-1" /> Refuse
                      </Button>
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </Tab>

          <Tab
            eventKey="outgoing"
            title={
              <span>
                <FiSend className="me-1" /> Sent{" "}
                <Badge bg="secondary">{outgoingCount}</Badge>
              </span>
            }
          >
            {loading ? (
              <LoadingBlock />
            ) : outgoingCount === 0 ? (
              <EmptyState
                icon={<FiSend size={42} />}
                title="No pending sent requests"
                hint="Use the search bar above to find someone to add."
              />
            ) : (
              <ListGroup className="mt-2">
                {store.outgoingRequests.map((req) => (
                  <ListGroup.Item
                    key={req.id}
                    className="bg-transparent border-secondary text-light d-flex justify-content-between align-items-center flex-wrap gap-2"
                  >
                    <Link to={`/friends/${req.friend.id}`} className="friend-row-link d-flex align-items-center gap-3">
                      <div style={avatarStyle(req.friend.id)}>
                        {initials(req.friend.email)}
                      </div>
                      <div>
                        <div className="fw-semibold">{req.friend.email}</div>
                        <div className="small text-secondary">
                          <FiClock className="me-1" />
                          Waiting since{" "}
                          {new Date(req.created_at).toLocaleString()}
                        </div>
                      </div>
                    </Link>
                    <Button
                      variant="outline-warning"
                      size="sm"
                      disabled={busy === `can-${req.id}`}
                      onClick={() => handleCancel(req)}
                    >
                      Cancel request
                    </Button>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </Tab>
        </Tabs>
      </Container>

      {/* CONFIRM UNFRIEND */}
      <Modal
        show={!!confirmRemove}
        onHide={() => setConfirmRemove(null)}
        centered
        contentClassName="bg-dark text-light border border-secondary"
      >
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title>Remove friend?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to remove{" "}
          <strong>{confirmRemove?.friend?.email}</strong> from your friends? This
          cannot be undone &mdash; you will need to send a new request to
          reconnect.
        </Modal.Body>
        <Modal.Footer className="border-secondary">
          <Button variant="outline-light" onClick={() => setConfirmRemove(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleUnfriend}>
            <FiTrash2 className="me-1" /> Remove
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// =============================================================
// SMALL PRESENTATIONAL COMPONENTS
// =============================================================
const LoadingBlock = () => (
  <div className="text-center py-5 text-secondary">
    <Spinner animation="border" />
    <div className="mt-2">Loading...</div>
  </div>
);

const EmptyState = ({ icon, title, hint }) => (
  <div className="text-center py-5 text-secondary">
    <div className="mb-2">{icon}</div>
    <h5 className="text-light">{title}</h5>
    <div className="small">{hint}</div>
  </div>
);

export default Friends;
