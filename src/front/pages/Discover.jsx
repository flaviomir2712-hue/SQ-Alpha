import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Spinner, Badge } from "react-bootstrap";
import { FiCompass, FiSearch, FiMapPin, FiStar, FiBriefcase, FiUser } from "react-icons/fi";

import { api } from "../services/api";
import { DiscoverPanel } from "../components/DiscoverPanel";

// ════════════════════════════════════════════════════════════════
// Discover — full page (route /discover).
// Two views via a segmented toggle in the header:
//   • Events   → reuses <DiscoverPanel variant="page"> (Ticketmaster etc.)
//   • Creators → internal search over business-places, influencers and
//                business-owners → tap a result to open their profile.
// Discover used to be a floating panel over the map; it's now a page,
// so "Near me" gets the GPS via the browser, and the external-event
// "+ SideQuest" / "show on map" actions hand the event back to the map
// through sessionStorage (read by Mapview on mount).
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
.sq-discover-page-head .accent { color: #ec4899; }
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
.sq-creator-card {
  display: flex; align-items: center; gap: 0.85rem;
  background: #161922; border: 1px solid #262a36; border-radius: 12px;
  padding: 0.7rem 0.85rem; margin-bottom: 0.7rem; cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.sq-creator-card:hover { transform: translateY(-2px); border-color: #6366f1; box-shadow: 0 8px 22px rgba(99,102,241,0.16); }
.sq-creator-avatar { width: 52px; height: 52px; border-radius: 12px; object-fit: cover; background: #0f111a; border: 1px solid #262a36; flex-shrink: 0; }
.sq-creator-avatar-fallback {
  width: 52px; height: 52px; border-radius: 12px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #6366f1, #ec4899); color: #fff;
}
.sq-creator-body { flex: 1; min-width: 0; }
.sq-creator-title { font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sq-creator-sub { font-size: 0.82rem; color: #adb5bd; }
.sq-creator-kind {
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  border-radius: 999px; padding: 0.1rem 0.5rem; border: 1px solid #262a36; color: #adb5bd; background: #1e2230;
  flex-shrink: 0;
}
.sq-discover-page .form-control, .sq-discover-page .form-control:focus,
.sq-discover-page .form-select, .sq-discover-page .form-select:focus {
  background-color: #0f111a !important; color: #e9ecef !important; border-color: #2a2f42 !important; box-shadow: none;
}
.sq-discover-page .form-control::placeholder { color: #6c757d; }
.sq-creator-empty { color: #6c757d; font-style: italic; text-align: center; padding: 2rem 0; }
`;

const KIND_META = {
  place:      { label: "Place",      icon: <FiBriefcase size={22} /> },
  influencer: { label: "Influencer", icon: <FiStar size={22} /> },
  owner:      { label: "Owner",      icon: <FiUser size={22} /> },
};

export const Discover = () => {
  const navigate = useNavigate();
  const [view, setView] = useState("events"); // events | creators

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
  const handlePreview = (ev) => {
    // On a page there's no map to fly; "show on map" just opens the map.
    navigate("/app");
  };

  // ── creators search ──
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);

  const runCreatorSearch = async (query, type) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (query.trim()) p.set("q", query.trim());
      if (type && type !== "all") p.set("type", type);
      const data = await api.get(`/discover/creators?${p.toString()}`);
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  // Debounced search whenever in creators view and query/kind change.
  useEffect(() => {
    if (view !== "creators") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runCreatorSearch(q, kind), 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kind, view]);

  return (
    <div className="sq-discover-page">
      <style>{CSS}</style>
      <div className="sq-discover-page-inner">
        <div className="sq-discover-page-head">
          <FiCompass />
          Discover {view === "creators" && <span className="accent">/ creators</span>}
        </div>

        <div className="sq-discover-seg">
          <button className={view === "events" ? "active" : ""} onClick={() => setView("events")}>
            Events
          </button>
          <button className={view === "creators" ? "active" : ""} onClick={() => setView("creators")}>
            Creators
          </button>
        </div>

        {/* ── EVENTS ── */}
        {view === "events" && (
          <DiscoverPanel
            variant="page"
            show
            userCenter={userCenter}
            onPreview={handlePreview}
            onCreateFrom={handleCreateFrom}
            onClose={() => {}}
          />
        )}

        {/* ── CREATORS ── */}
        {view === "creators" && (
          <>
            <div className="d-flex gap-2 mb-3">
              <Form.Control
                placeholder="Search places, influencers, owners…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
              />
              <Form.Select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 150 }}>
                <option value="all">All</option>
                <option value="place">Places</option>
                <option value="influencer">Influencers</option>
                <option value="owner">Owners</option>
              </Form.Select>
            </div>

            {loading && (
              <div className="text-center py-4"><Spinner animation="border" /></div>
            )}

            {!loading && results.map((r) => {
              const meta = KIND_META[r.kind] || KIND_META.place;
              return (
                <div
                  key={`${r.kind}-${r.id}`}
                  className="sq-creator-card"
                  onClick={() => navigate(r.link)}
                >
                  {r.picture ? (
                    <img src={r.picture} alt={r.title} className="sq-creator-avatar"
                      onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <div className="sq-creator-avatar-fallback">{meta.icon}</div>
                  )}
                  <div className="sq-creator-body">
                    <div className="sq-creator-title">{r.title}</div>
                    <div className="sq-creator-sub">
                      {r.subtitle}
                      {r.rating != null && (
                        <> · <FiStar size={12} style={{ color: "#f5b301", verticalAlign: "-1px" }} /> {r.rating}</>
                      )}
                    </div>
                  </div>
                  <span className="sq-creator-kind">{meta.label}</span>
                </div>
              );
            })}

            {!loading && searched && results.length === 0 && (
              <div className="sq-creator-empty">
                No creators found{q ? ` for “${q}”` : ""}. Try another name.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Discover;
