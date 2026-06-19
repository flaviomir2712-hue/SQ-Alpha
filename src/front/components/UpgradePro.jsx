import { useState } from "react";
import { Modal, Button, Spinner, Badge } from "react-bootstrap";
import { FiStar, FiCheck } from "react-icons/fi";

import { api } from "../services/api";
import { setSession } from "../services/auth";

// ════════════════════════════════════════════════════════════════
// UpgradePro — reusable "⭐ Go Pro / Go Premium" button + activation modal.
//
// Billing tier is decided by account_type:
//   business / influencer  → "pro"      (priced events, Discover priority…)
//   person                 → "premium"  (bigger friend cap, coins, rewards)
//
// Payment isn't wired yet (provider TBD), so "Activate" hits the backend
// stub (/subscriptions/activate) which turns the sub on for 30 days with no
// charge. On success the refreshed user is persisted (setSession) and handed
// back via onUpgraded so is_pro / is_premium flip across the UI.
//
// If the user is already on their plan, this renders a small active badge
// instead of the button.
// ════════════════════════════════════════════════════════════════

const planFor = (accountType) =>
  accountType === "business" || accountType === "influencer"
    ? {
        plan: "pro",
        short: "Pro",
        title: "SideQuest Pro",
        tagline: "For businesses & influencers",
        perks: [
          "Set a ticket / entry price on your events",
          "Your events show first in Discover",
          "A professional profile for your venue or brand",
        ],
      }
    : {
        plan: "premium",
        short: "Premium",
        title: "SideQuest Premium",
        tagline: "Get more out of SideQuest",
        perks: [
          "Go beyond 150 friends (up to 1000)",
          "Earn premium coins shown on your profile",
          "More rewards",
        ],
      };

const STAR = <FiStar style={{ verticalAlign: "-2px" }} />;

export const UpgradePro = ({
  user,
  business,        // optional: when set, activates THIS company's Pro
  onUpgraded,
  size = "sm",
  block = false,
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Per-company mode: a business owner upgrades a specific company to Pro.
  const meta = business
    ? {
        plan: "pro",
        short: "Pro",
        title: `${business.name} → Pro`,
        tagline: "Upgrade this company",
        perks: [
          "Set a ticket / entry price on this company's events",
          "This company's events show first in Discover",
          "A verified professional profile for this company",
        ],
      }
    : planFor(user?.account_type);
  const isActive = business
    ? !!business.is_pro
    : (meta.plan === "pro" ? !!user?.is_pro : !!user?.is_premium);

  if (isActive) {
    return (
      <Badge bg="warning" text="dark" className={className} title={`${meta.title} active`}>
        {STAR} {meta.short}
      </Badge>
    );
  }

  const activate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const payload = business
        ? { plan: "pro", business_id: business.id }
        : { plan: meta.plan };
      const data = await api.post("/subscriptions/activate", payload);
      if (data.user) {
        setSession(data.user);
      }
      onUpgraded && onUpgraded(data.user, business || null);
      setOpen(false);
    } catch (e) {
      setErr(e.message || "Could not activate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        onClick={() => setOpen(true)}
        className={`sq-upgrade-btn ${block ? "w-100" : ""} ${className}`}
      >
        {STAR} Go {meta.short}
      </Button>

      <Modal show={open} onHide={() => !busy && setOpen(false)} centered className="sq-modal">
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title>{STAR} {meta.title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-secondary mb-2">{meta.tagline}</p>
          <ul className="sq-upgrade-perks">
            {meta.perks.map((p) => (
              <li key={p}><FiCheck className="me-2" />{p}</li>
            ))}
          </ul>
          {err && <div className="text-danger small mb-2">{err}</div>}
          <div className="sq-upgrade-note small text-secondary">
            Payment isn’t wired up yet — this turns on a free 30-day trial so
            you can try the features. No card, no charge.
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setOpen(false)} disabled={busy}>
            Not now
          </Button>
          <Button className="sq-upgrade-btn" onClick={activate} disabled={busy}>
            {busy ? <Spinner size="sm" animation="border" /> : <>{STAR} Activate</>}
          </Button>
        </Modal.Footer>
      </Modal>

      <style>{`
        .sq-modal .modal-content{background:#161922;color:#e9ecef;border:1px solid #262a36;border-radius:14px;}
        .sq-modal .modal-header,.sq-modal .modal-footer{border-color:#262a36;}
        .sq-modal .form-control,.sq-modal .form-select,.sq-modal .form-control:focus,.sq-modal .form-select:focus{background-color:#0f111a!important;color:#e9ecef!important;border-color:#2a2f42!important;box-shadow:none;}
        .sq-modal .form-control::placeholder{color:#6c757d;}
        .sq-modal .btn-close{filter:invert(1) grayscale(1) brightness(2);}
        .sq-upgrade-btn {
          background: linear-gradient(135deg, #f5b301, #ec4899);
          border: none; color: #1a1320; font-weight: 700;
        }
        .sq-upgrade-btn:hover, .sq-upgrade-btn:focus,
        .sq-upgrade-btn:active { filter: brightness(1.06); color: #1a1320; }
        .sq-upgrade-perks { list-style: none; padding: 0; margin: 0 0 0.75rem; }
        .sq-upgrade-perks li { padding: 0.2rem 0; }
        .sq-upgrade-perks svg { color: #2ecc71; }
        .sq-upgrade-note { border-top: 1px solid #2a2f42; padding-top: 0.5rem; }
      `}</style>
    </>
  );
};

export default UpgradePro;
