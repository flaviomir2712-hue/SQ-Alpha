import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Dropdown,
  Badge,
  Spinner,
  Alert,
  Button,
} from "react-bootstrap";
import {
  FiBriefcase,
  FiChevronDown,
  FiStar,
  FiCheckCircle,
  FiClock,
  FiGrid,
  FiUsers,
  FiExternalLink,
  FiPlus,
} from "react-icons/fi";

import { EventModal } from "../components/EventModal";
import { CompanyEventCard } from "../components/CompanyEventCard";
import { TeamManager } from "../components/TeamManager";

// =============================================================
// CompanyHub — Phase 5a/5b, route /manage
// Management hub for PRO accounts (business / influencer). Person accounts
// don't reach it (navbar entry gated + backend returns 403).
//   - business   → company selector + that company's events + Team manager.
//   - influencer → their own events.
// Each event is a CompanyEventCard; click opens the EventModal.
// Consumes /api/manage/scope and /api/manage/events.
// =============================================================

const API = import.meta.env.VITE_BACKEND_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const CSS = `
.company-hub-page {
  min-height: 100dvh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236,72,153,0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef;
  padding-top: 80px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
  overflow-x: hidden;
  overflow-x: clip;
}
.company-hub-page .sq-biz-toggle {
  background: #161922; border: 1px solid #262a36; color: #fff;
  display: inline-flex; align-items: center; gap: 0.5rem;
}
.company-hub-page .sq-biz-toggle:hover,
.company-hub-page .sq-biz-toggle:focus {
  background: #1e2230; border-color: #3a3f55; color: #fff;
}
.company-hub-page .sq-biz-menu {
  background: #12141c; border: 1px solid #262a36; min-width: 260px;
}
.company-hub-page .sq-biz-menu .dropdown-item { color: #e9ecef; }
.company-hub-page .sq-biz-menu .dropdown-item:hover { background: #1e2230; }
.company-hub-page .sq-biz-menu .dropdown-item.active { background: rgba(99,102,241,0.18); }
.sq-biz-badges { display: inline-flex; gap: 0.3rem; margin-left: 0.5rem; }
.sq-biz-badges .badge { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; }
`;

export const CompanyHub = () => {
  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const navigate = useNavigate();

  const [scopeType, setScopeType] = useState(null);   // "business" | "influencer"
  const [notPro, setNotPro]       = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBizId, setSelectedBizId] = useState(null);

  const [events, setEvents]   = useState([]);
  const [loadingScope, setLoadingScope] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError]     = useState(null);

  const [modalOpen, setModalOpen]         = useState(false);
  const [activeEventId, setActiveEventId] = useState(null);
  const [showTeam, setShowTeam]           = useState(false);

  // ── load scope (what can I manage?) ──
  useEffect(() => {
    (async () => {
      setLoadingScope(true);
      setError(null);
      try {
        const res = await fetch(`${API}/api/manage/scope`, { headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) { setNotPro(true); return; }
        if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);

        setScopeType(data.type);
        if (data.type === "business") {
          const list = Array.isArray(data.businesses) ? data.businesses : [];
          setBusinesses(list);
          if (list.length) setSelectedBizId(list[0].id);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingScope(false);
      }
    })();
  }, []);

  // ── load events whenever the scope / selected business changes ──
  const loadEvents = async () => {
    if (scopeType === "business" && !selectedBizId) { setEvents([]); return; }
    setLoadingEvents(true);
    setError(null);
    try {
      const qs = scopeType === "business" ? `?business_id=${selectedBizId}` : "";
      const res = await fetch(`${API}/api/manage/events${qs}`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || `Request failed (${res.status})`);
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (!scopeType) return;
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, selectedBizId]);

  const openEvent  = (id) => { setActiveEventId(id); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setActiveEventId(null); };
  const openCreate = () => { setActiveEventId(null); setModalOpen(true); };

  const selectedBiz = businesses.find((b) => b.id === selectedBizId) || null;

  // ── render gates ──
  if (loadingScope) {
    return (
      <div className="company-hub-page">
        <style>{CSS}</style>
        <div className="text-center py-5 text-secondary"><Spinner animation="border" /></div>
      </div>
    );
  }

  if (notPro) {
    return (
      <div className="company-hub-page">
        <style>{CSS}</style>
        <Container className="py-5 text-center text-secondary">
          <FiBriefcase size={42} className="mb-3" />
          <h4 className="text-light">Management is for Pro accounts only</h4>
          <p>The company hub is available for business and influencer accounts.</p>
        </Container>
      </div>
    );
  }

  return (
    <div className="company-hub-page">
      <style>{CSS}</style>

      <Container className="py-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-light mb-1 d-flex align-items-center gap-2">
              <FiBriefcase /> Manage
            </h1>
            <p className="text-secondary mb-0">
              Your events, their price, how many events users create at your place,
              your team note and reviews.
            </p>
          </div>

          {/* Company selector + Team + public page (business only) */}
          {scopeType === "business" && businesses.length > 0 && (
            <div className="d-flex gap-2 flex-wrap align-items-center">
            <Dropdown>
              <Dropdown.Toggle className="sq-biz-toggle" id="biz-selector">
                <FiBriefcase /> {selectedBiz?.name || "Select a company"} <FiChevronDown />
              </Dropdown.Toggle>
              <Dropdown.Menu className="sq-biz-menu" align="end">
                <Dropdown.Header>Your companies</Dropdown.Header>
                {businesses.map((b) => (
                  <Dropdown.Item
                    key={b.id}
                    active={b.id === selectedBizId}
                    onClick={() => setSelectedBizId(b.id)}
                  >
                    {b.name}
                    <span className="sq-biz-badges">
                      {b.is_pro && <Badge bg="primary"><FiStar /> Pro</Badge>}
                      {b.verified
                        ? <Badge bg="success"><FiCheckCircle /> Verified</Badge>
                        : <Badge bg="secondary"><FiClock /> Pending</Badge>}
                    </span>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            {selectedBizId && (
              <>
                <Button className="sq-biz-toggle" onClick={() => setShowTeam(true)}>
                  <FiUsers /> Team
                </Button>
                <Button className="sq-biz-toggle" onClick={() => navigate(`/business/${selectedBizId}`)}>
                  <FiExternalLink /> View public page
                </Button>
                <Button variant="primary" onClick={openCreate}>
                  <FiPlus className="me-1" /> New event
                </Button>
              </>
            )}
            </div>
          )}

          {scopeType === "influencer" && (
            <Button variant="primary" onClick={openCreate}>
              <FiPlus className="me-1" /> New event
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>
        )}

        {scopeType === "business" && businesses.length === 0 ? (
          <div className="text-center py-5 text-secondary">
            <FiBriefcase size={42} className="mb-2" />
            <h5 className="text-light">No companies yet</h5>
            <div className="small">Add a company from your profile to start managing it here.</div>
          </div>
        ) : loadingEvents ? (
          <div className="text-center py-5 text-secondary"><Spinner animation="border" /></div>
        ) : events.length === 0 ? (
          <div className="text-center py-5 text-secondary">
            <FiGrid size={42} className="mb-2" />
            <h5 className="text-light">No events yet</h5>
            <div className="small">
              {scopeType === "business"
                ? "Create an event for this company and it'll show up here."
                : "Create your first event and it'll show up here."}
            </div>
          </div>
        ) : (
          <Row className="g-3" role="list" aria-label="Company events">
            {events.map((e) => (
              <Col md={6} lg={4} key={e.id} role="listitem">
                <CompanyEventCard event={e} onOpen={openEvent} onChanged={loadEvents} />
              </Col>
            ))}
          </Row>
        )}
      </Container>

      <EventModal
        show={modalOpen}
        onHide={closeModal}
        eventId={activeEventId}
        prefillCoords={null}
        currentUser={currentUser}
        businessId={scopeType === "business" ? selectedBizId : null}
        onSaved={loadEvents}
        onDeleted={loadEvents}
      />

      <TeamManager
        show={showTeam}
        onHide={() => setShowTeam(false)}
        businessId={selectedBizId}
        businessName={selectedBiz?.name}
      />
    </div>
  );
};

export default CompanyHub;
