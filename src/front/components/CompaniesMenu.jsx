import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown, Modal, Button, Form, Spinner, Badge } from "react-bootstrap";
import {
  FiPlus,
  FiStar,
  FiCheckCircle,
  FiClock,
  FiBriefcase,
  FiUploadCloud,
} from "react-icons/fi";

import { api } from "../services/api";
import { UpgradePro } from "./UpgradePro";

// ════════════════════════════════════════════════════════════════
// CompaniesMenu — top-right dropdown on the business owner's profile.
//
// Lists every registered company with its status (✓ verified, ⭐ Pro) and a
// per-company "Go Pro" button (Pro is billed PER COMPANY). A "+ Add company"
// item opens a modal: name + proof document (the owner pays per company, so
// each submits a proof and stays unverified until reviewed).
//
// `autoClose="outside"` keeps the menu open while interacting with the
// per-company upgrade modal.
// ════════════════════════════════════════════════════════════════

export const CompaniesMenu = ({ onChanged }) => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get("/businesses/mine");
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreated = (biz) => {
    setShowAdd(false);
    setCompanies((c) => [...c, biz]);
    onChanged && onChanged();
  };

  const handleUpgraded = () => {
    // The company's pro status changed — refetch so the badge updates.
    load();
    onChanged && onChanged();
  };

  const label =
    companies.length === 0
      ? "My companies"
      : companies.length === 1
      ? companies[0].name
      : `My companies (${companies.length})`;

  return (
    <>
      <Dropdown autoClose="outside" align="end">
        <Dropdown.Toggle variant="outline-light" size="sm" id="companies-menu">
          <FiBriefcase className="me-1" /> {label}
        </Dropdown.Toggle>

        <Dropdown.Menu className="sq-companies-menu">
          <Dropdown.Header>Your companies</Dropdown.Header>

          {loading && (
            <div className="px-3 py-2 text-secondary small d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" /> Loading…
            </div>
          )}

          {!loading && companies.length === 0 && (
            <div className="px-3 py-2 text-secondary small">No companies yet.</div>
          )}

          {companies.map((b) => (
            <div key={b.id} className="sq-company-row">
              <div className="sq-company-info">
                <div
                  className="sq-company-name"
                  role="button"
                  onClick={() => navigate(`/business/${b.id}`)}
                  style={{ cursor: "pointer" }}
                  title="View public page"
                >
                  {b.name}
                </div>
                <div className="sq-company-badges">
                  {b.verified ? (
                    <Badge bg="success"><FiCheckCircle /> Verified</Badge>
                  ) : (
                    <Badge bg="secondary"><FiClock /> Pending review</Badge>
                  )}
                </div>
              </div>
              <UpgradePro business={b} onUpgraded={handleUpgraded} />
            </div>
          ))}

          <Dropdown.Divider />
          <Dropdown.Item as="button" onClick={() => setShowAdd(true)}>
            <FiPlus className="me-2" /> Add company
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <AddCompanyModal
        show={showAdd}
        onHide={() => setShowAdd(false)}
        onCreated={handleCreated}
      />

      <style>{`
        .sq-modal .modal-content{background:#161922;color:#e9ecef;border:1px solid #262a36;border-radius:14px;}
        .sq-modal .modal-header,.sq-modal .modal-footer{border-color:#262a36;}
        .sq-modal .form-control,.sq-modal .form-select,.sq-modal .form-control:focus,.sq-modal .form-select:focus{background-color:#0f111a!important;color:#e9ecef!important;border-color:#2a2f42!important;box-shadow:none;}
        .sq-modal .form-control::placeholder{color:#6c757d;}
        .sq-modal .btn-close{filter:invert(1) grayscale(1) brightness(2);}
        .sq-companies-menu { min-width: 290px; background: #12141c; border: 1px solid #262a36; }
        .sq-companies-menu .dropdown-header { color: #8a93a5; text-transform: uppercase; font-size: 0.7rem; }
        .sq-companies-menu .dropdown-item { color: #e9ecef; }
        .sq-company-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.75rem; padding: 0.4rem 0.85rem;
        }
        .sq-company-name { color: #fff; font-weight: 600; font-size: 0.9rem; }
        .sq-company-badges { margin-top: 0.15rem; display: flex; gap: 0.3rem; }
        .sq-company-badges .badge { font-weight: 600; display: inline-flex; align-items: center; gap: 3px; }
      `}</style>
    </>
  );
};

// ── Add-company modal ──────────────────────────────────────────
const AddCompanyModal = ({ show, onHide, onCreated }) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [proofName, setProofName] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);

  const reset = () => {
    setName(""); setCategory(""); setProofName(""); setProofUrl("");
    setUploading(false); setSaving(false); setErr(null);
  };

  const close = () => { if (!saving && !uploading) { reset(); onHide(); } };

  const pickProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    setProofName(file.name);
    try {
      // uploadDocument acepta imagen O PDF (los PDF se suben sin comprimir).
      const { uploadDocument } = await import("../utils/uploadImage");
      const url = await uploadDocument(file, "proof");
      setProofUrl(url);
    } catch (e2) {
      setErr("Could not upload the proof. Try another file.");
      setProofName("");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) { setErr("Company name is required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const data = await api.post("/businesses", {
        name: name.trim(),
        category: category.trim() || undefined,
        proof_url: proofUrl || undefined,
      });
      reset();
      onCreated(data.business);
    } catch (e2) {
      setErr(e2.message || "Could not create the company.");
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={close} centered className="sq-modal">
      <Modal.Header closeButton closeVariant="white">
        <Modal.Title><FiBriefcase className="me-2" /> Add a company</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Company name</Form.Label>
          <Form.Control
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Café Central"
            autoFocus
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Category <span className="text-secondary">(optional)</span></Form.Label>
          <Form.Control
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="restaurant, bar, brand…"
          />
        </Form.Group>

        <Form.Group className="mb-2">
          <Form.Label>Proof of registration</Form.Label>
          <div className="d-flex align-items-center gap-2">
            <Button
              variant="outline-light"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Spinner size="sm" animation="border" /> : <FiUploadCloud className="me-1" />}
              {proofName ? "Change file" : "Upload a photo/scan or PDF"}
            </Button>
            {proofName && <span className="small text-secondary text-truncate">{proofName}</span>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="d-none"
            onChange={pickProof}
          />
          <div className="small text-secondary mt-1">
            You pay per company, so each one is verified before going live. A
            photo, scan or PDF of your registration certificate works.
          </div>
        </Form.Group>

        {err && <div className="text-danger small mt-2">{err}</div>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={close} disabled={saving || uploading}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={saving || uploading}>
          {saving ? <Spinner size="sm" animation="border" /> : "Add company"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CompaniesMenu;
