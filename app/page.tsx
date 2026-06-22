"use client";

import { useEffect, useState } from "react";

type Employee = {
  name: string;
  manager: string;
  lastInspectionDate: string;
  submitted: boolean;
  issueStatus: string;
};

type Branch = {
  branch: string;
  total: number;
  submitted: number;
  notSubmitted: number;
  issuesFlagged: number;
  employees: Employee[];
};

type DashboardData = {
  summary: {
    totalEmployees: number;
    totalSubmitted: number;
    totalNotSubmitted: number;
    totalIssuesFlagged: number;
    submissionRate: number;
    generatedAt: string;
  };
  branches: Branch[];
};

const colors = {
  bg: "#0f172a",
  card: "#1e293b",
  border: "#334155",
  text: "#e2e8f0",
  muted: "#94a3b8",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
};

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: "16px 20px",
        flex: "1 1 160px",
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || colors.text }}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "notSubmitted" | "issues">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div style={{ background: colors.bg, color: colors.red, minHeight: "100vh", padding: 24 }}>
        <h2>Error loading dashboard</h2>
        <p>{error}</p>
        <button onClick={load} style={{ padding: "8px 16px" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          background: colors.bg,
          color: colors.text,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Loading inspection data…
      </div>
    );
  }

  const { summary, branches } = data;
  const maxTotal = Math.max(...branches.map((b) => b.total), 1);

  return (
    <main style={{ background: colors.bg, color: colors.text, minHeight: "100vh", padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Vehicle Inspection Dashboard</h1>
          <span style={{ fontSize: 12, color: colors.muted }}>
            Updated {new Date(summary.generatedAt).toLocaleString()}
          </span>
        </header>

        <section style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <StatCard label="Total Required" value={summary.totalEmployees} />
          <StatCard label="Submitted This Week" value={summary.totalSubmitted} color={colors.green} />
          <StatCard label="Not Submitted" value={summary.totalNotSubmitted} color={colors.red} />
          <StatCard label="Issues Flagged" value={summary.totalIssuesFlagged} color={colors.amber} />
          <StatCard label="Submission Rate" value={`${summary.submissionRate}%`} color={colors.blue} />
        </section>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Submission Status by Branch</h2>
          <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
            {branches.map((b) => (
              <div key={b.branch} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>{b.branch}</span>
                  <span style={{ color: colors.muted }}>
                    {b.submitted}/{b.total} submitted
                    {b.issuesFlagged > 0 && (
                      <span style={{ color: colors.amber }}> · {b.issuesFlagged} flagged</span>
                    )}
                  </span>
                </div>
                <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: colors.border, width: "100%" }}>
                  <div style={{ width: `${(b.submitted / maxTotal) * 100}%`, background: colors.green }} />
                  <div style={{ width: `${(b.notSubmitted / maxTotal) * 100}%`, background: colors.red }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {(["all", "notSubmitted", "issues"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  background: filter === f ? colors.blue : "transparent",
                  color: colors.text,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {f === "all" ? "All Branches" : f === "notSubmitted" ? "Not Submitted" : "Issues Flagged"}
              </button>
            ))}
          </div>

          {branches.map((b) => {
            const list =
              filter === "notSubmitted"
                ? b.employees.filter((e) => !e.submitted)
                : filter === "issues"
                ? b.employees.filter((e) => e.issueStatus === "Issue Flagged")
                : b.employees;
            if (filter !== "all" && list.length === 0) return null;
            const isOpen = expanded === b.branch || filter !== "all";
            return (
              <div key={b.branch} style={{ marginBottom: 10, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden" }}>
                <button
                  onClick={() => setExpanded(expanded === b.branch ? null : b.branch)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 16px",
                    background: "transparent",
                    border: "none",
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {b.branch} ({list.length})
                </button>
                {isOpen && (
                  <div style={{ padding: "0 16px 12px" }}>
                    {list.length === 0 && <div style={{ color: colors.muted, fontSize: 13 }}>None</div>}
                    {list.map((e) => (
                      <div
                        key={e.name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          padding: "6px 0",
                          borderTop: `1px solid ${colors.border}`,
                        }}
                      >
                        <span>{e.name}</span>
                        <span style={{ color: colors.muted, textAlign: "right" }}>
                          {e.manager}
                          {" · "}
                          <span style={{ color: e.submitted ? colors.green : colors.red }}>
                            {e.submitted ? "Submitted" : "Not Submitted"}
                          </span>
                          {e.issueStatus === "Issue Flagged" && (
                            <span style={{ color: colors.amber }}> · Issue</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
