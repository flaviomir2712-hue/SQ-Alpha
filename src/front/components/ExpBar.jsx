import { useEffect, useState } from "react";
import { api } from "../services/api";
import { FiZap } from "react-icons/fi";

// Self-contained EXP / "connection points" level bar. Drop <ExpBar /> anywhere
// in a profile. It fetches its own data and ALWAYS renders (defaults to level 1
// if the backend/endpoint/table isn't ready yet), so it can never silently
// disappear the way an inline `{exp && ...}` block can.
export const ExpBar = () => {
  const [exp, setExp] = useState({
    level: 1, progress_in_level: 0, level_needs: 40, pending: 0,
  });

  useEffect(() => {
    let alive = true;
    api.get("/exp/me")
      .then((d) => { if (alive && d) setExp(d); })
      .catch(() => { /* keep the default so the bar still shows */ });
    return () => { alive = false; };
  }, []);

  const pct = Math.min(100, (exp.progress_in_level / Math.max(1, exp.level_needs)) * 100);
  const pendingPct = Math.min(100, ((exp.progress_in_level + (exp.pending || 0)) / Math.max(1, exp.level_needs)) * 100);

  return (
    <div style={{ background: "#161922", border: "1px solid #262a36", borderRadius: 14, padding: "14px 16px", margin: "0 0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#9aa0b4", fontWeight: 600 }}>
          <FiZap size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          LvL {exp.level} — Exp {exp.progress_in_level}/{exp.level_needs}
        </span>
        {exp.pending > 0 && (
          <span style={{ background: "#f0b429", color: "#111", borderRadius: 999, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
            +{exp.pending} to claim
          </span>
        )}
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 999, background: "#0b0d12", overflow: "hidden", border: "1px solid #262a36" }}>
        {exp.pending > 0 && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pendingPct}%`, background: "repeating-linear-gradient(45deg,#3a2f5a,#3a2f5a 6px,#2a2340 6px,#2a2340 12px)" }} />
        )}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: "linear-gradient(90deg,#6366f1,#ec4899)" }} />
      </div>
      <div style={{ fontSize: "0.78rem", color: "#9aa0b4", marginTop: 6 }}>Connection points</div>
    </div>
  );
};

export default ExpBar;
