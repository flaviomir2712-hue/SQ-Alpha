import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCompass } from "react-icons/fi";

import { DiscoverPanel } from "../components/DiscoverPanel";

// ════════════════════════════════════════════════════════════════
// Discover — full page (route /discover).
// SINGLE "Events" view: reuses <DiscoverPanel variant="page">, which
// shows internal SideQuest events (created by business / influencer
// accounts) in front of the external providers (Ticketmaster, etc.).
// Ordering is decided by the backend: date first, then internal-before-
// external within the same date.
//
// This page is the MOBILE form of Discover. On desktop the same panel
// opens as an in-map overlay ("modal") from Mapview; on touch devices the
// Discover button routes here instead (one modal on computer, one page
// on mobile).
//
// The Creators view (places / influencers / owners search) was removed:
// pros' events now surface directly inside this Events list, so a separate
// tab is no longer needed. The two location modes — "Near me" (GPS) and
// "City / trip" (typed place) — both live inside <DiscoverPanel>.
//
// "Near me" gets the GPS via the browser; the external-event "+ SideQuest"
// / "show on map" actions hand the event back to the map through
// sessionStorage (read by Mapview on mount).
// ════════════════════════════════════════════════════════════════

const CSS = `
.sq-discover-page {
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.15), transparent 60%),
    radial-gradient(900px 500px at 100% 10%, rgba(236,72,153,0.10), transparent 60%),
    #0b0d12;
  color: #e9ecef;
  padding-top: 80px;
  padding-bottom: 110px;
}
.sq-discover-page-inner { max-width: 760px; margin: 0 auto; padding: 0 1rem; }
.sq-discover-page-head {
  display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;
  font-weight: 700; font-size: 1.4rem; color: #fff;
}
.sq-discover-seg {
  display: flex; gap: 0.4rem; margin-bottom: 1.25rem;
  background: #0f111a; border: 1px solid #262a36; border-radius: 999px; padding: 0.3rem;
}
.sq-discover-seg button {
  flex: 1; border: none; background: transparent; color: #adb5bd;
  font-weight: 600; padding: 0.45rem 0.6rem; border-radius: 999px;
  transition: background 0.15s ease, color 0.15s ease;
}
.sq-discover-seg button.active {
  background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff;
}
`;

export const Discover = () => {
  const navigate = useNavigate();

  // ── geolocation for the events "Near me" mode ──
  const [userCenter, setUserCenter] = useState(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCenter([pos.coords.latitude, pos.coords.longitude]),
      () => setUserCenter(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  }, []);

  // Hand an external event back to the map (which owns the create flow).
  const handleCreateFrom = (ev) => {
    try { sessionStorage.setItem("sq_discover_prefill", JSON.stringify(ev)); } catch { /* ignore */ }
    navigate("/app");
  };
  // On a page there's no map to fly to; "show on map" just opens the map.
  const handlePreview = () => {
    navigate("/app");
  };

  return (
    <div className="sq-discover-page">
      <style>{CSS}</style>
      <div className="sq-discover-page-inner">
        <div className="sq-discover-page-head">
          <FiCompass />
          Discover
        </div>

        {/* Events/Creators toggle now lives inside <DiscoverPanel>. */}
        <DiscoverPanel
          variant="page"
          show
          userCenter={userCenter}
          onPreview={handlePreview}
          onCreateFrom={handleCreateFrom}
          onClose={() => {}}
        />
      </div>
    </div>
  );
};

export default Discover;
