import { useState, useEffect } from "react";
import { Spinner, Alert } from "react-bootstrap";
import { api } from "../services/api";
import { FiUsers, FiEye, FiCalendar, FiShare2, FiUserCheck } from "react-icons/fi";

// Commit 3 — owner analytics. Reads aggregate, privacy-safe data from
// /business/:id/dashboard or /influencer/dashboard. No names are ever
// shown — only counts, percentages and age buckets (suppressed under a
// small sample). Filtered by the window selector.

const WINDOWS = [
  { key: "week", label: "Last week" },
  { key: "two_weeks", label: "Last two weeks" },
  { key: "month", label: "Last month" },
  { key: "all", label: "All time" },
];

const CSS = `
.sq-dash { padding: 0.5rem 0 2rem; color: #e9ecef; }
.sq-dash-windows { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1.25rem; }
.sq-dash-win {
  background: #161922; border: 1px solid #262a36; color: #adb5bd;
  border-radius: 999px; padding: 6px 14px; font-size: 0.8rem; cursor: pointer;
  transition: all .15s ease;
}
.sq-dash-win:hover { color: #fff; border-color: #3a3f4d; }
.sq-dash-win.active {
  background: linear-gradient(135deg,#6366f1,#ec4899); color: #fff; border-color: transparent;
}
.sq-dash-hero {
  background: #0b0d12; border: 1px solid #262a36; border-radius: 14px;
  padding: 1.25rem 1.5rem; margin-bottom: 1rem; text-align: center;
}
.sq-dash-hero .label { font-size: 0.72rem; letter-spacing: .08em; text-transform: uppercase; color: #6c757d; }
.sq-dash-hero .value { font-size: 2.4rem; font-weight: 800; line-height: 1.1;
  background: linear-gradient(135deg,#818cf8,#f472b6); -webkit-background-clip: text;
  background-clip: text; -webkit-text-fill-color: transparent; }
.sq-dash-card {
  background: #161922; border: 1px solid #262a36; border-radius: 14px;
  padding: 1rem 1.1rem; margin-bottom: 0.85rem;
}
.sq-dash-card .ttl {
  font-size: 0.72rem; letter-spacing: .07em; text-transform: uppercase;
  color: #8b91a0; display: flex; align-items: center; gap: 6px; margin-bottom: 0.6rem;
}
.sq-dash-row { display: flex; align-items: center; justify-content: space-between; }
.sq-dash-num { font-size: 1.5rem; font-weight: 700; color: #fff; }
.sq-bar { height: 10px; border-radius: 999px; background: #0b0d12; overflow: hidden; display: flex; }
.sq-bar > span { display: block; height: 100%; }
.sq-seg-a { background: linear-gradient(90deg,#6366f1,#818cf8); }
.sq-seg-b { background: #2a2f3c; }
.sq-age-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 0.8rem; }
.sq-age-row .lab { width: 48px; color: #adb5bd; flex-shrink: 0; }
.sq-age-row .track { flex: 1; height: 8px; border-radius: 999px; background: #0b0d12; overflow: hidden; }
.sq-age-row .fill { height: 100%; background: linear-gradient(90deg,#6366f1,#ec4899); }
.sq-age-row .cnt { width: 28px; text-align: right; color: #6c757d; }
.sq-dash-muted { color: #6c757d; font-style: italic; font-size: 0.85rem; }
.sq-dash-split-legend { display: flex; justify-content: space-between; font-size: 0.78rem; margin-top: 6px; color: #adb5bd; }
`;

const StatCard = ({ icon, label, value }) => (
  <div className="sq-dash-card">
    <div className="ttl">{icon} {label}</div>
    <div className="sq-dash-num">{value}</div>
  </div>
);

export const DashboardPanel = ({ scope = "business", businessId = null }) => {
  const [window, setWindow] = useState("week");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (scope === "business" && !businessId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const path = scope === "business"
      ? `/business/${businessId}/dashboard?window=${window}`
      : `/influencer/dashboard?window=${window}`;
    api.get(path)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("Couldn't load the dashboard. Please try again."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scope, businessId, window]);

  const split = data?.follower_split;
  const age = data?.age;
  const maxAge = age?.buckets ? Math.max(1, ...age.buckets.map((b) => b.count)) : 1;

  return (
    <div className="sq-dash">
      <style>{CSS}</style>

      <div className="sq-dash-windows">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            className={`sq-dash-win ${window === w.key ? "active" : ""}`}
            onClick={() => setWindow(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : !data ? null : (
        <>
          {/* Clients headline */}
          <div className="sq-dash-hero">
            <div className="label">Clients</div>
            <div className="value">{data.clients}</div>
            <div className="sq-dash-muted" style={{ marginTop: 4 }}>
              confirmed attendees of your events
            </div>
          </div>

          {/* Age distribution */}
          <div className="sq-dash-card">
            <div className="ttl"><FiUsers /> Age of your clients</div>
            {age?.suppressed || !age?.buckets ? (
              <div className="sq-dash-muted">Not enough data yet to show this safely.</div>
            ) : (
              <>
                <div style={{ marginBottom: 8, color: "#fff" }}>
                  Mostly <strong>{age.dominant || "—"}</strong>
                </div>
                {age.buckets.map((b) => (
                  <div className="sq-age-row" key={b.label}>
                    <span className="lab">{b.label}</span>
                    <span className="track">
                      <span className="fill" style={{ width: `${(b.count / maxAge) * 100}%` }} />
                    </span>
                    <span className="cnt">{b.count}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Follower split */}
          <div className="sq-dash-card">
            <div className="ttl"><FiUserCheck /> Followers vs non-followers</div>
            {!split || data.clients === 0 ? (
              <div className="sq-dash-muted">No clients in this window yet.</div>
            ) : (
              <>
                <div className="sq-bar">
                  <span className="sq-seg-a" style={{ width: `${split.followers_pct}%` }} />
                  <span className="sq-seg-b" style={{ width: `${split.non_followers_pct}%` }} />
                </div>
                <div className="sq-dash-split-legend">
                  <span>Followers {split.followers_pct}%</span>
                  <span>Non-followers {split.non_followers_pct}%</span>
                </div>
              </>
            )}
          </div>

          <StatCard icon={<FiEye />} label="Accounts that saw your profile" value={data.profile_views} />
          <StatCard icon={<FiEye />} label="Accounts that saw your events" value={data.event_views} />
          <StatCard icon={<FiCalendar />} label={data.created?.label || "Created"} value={data.created?.value ?? 0} />
          <StatCard icon={<FiShare2 />} label="Accounts that shared your profile" value={data.shares} />
        </>
      )}
    </div>
  );
};

export default DashboardPanel;
