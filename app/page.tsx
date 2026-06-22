"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { listWeeksOfYear } from "@/lib/weeks";

type Employee = {
  id: string;
  name: string;
  branch: string;
  manager: string;
  active: boolean;
};

type Submission = {
  employeeId: string;
  date: string;
  weekKey: string;
  issueFlagged: boolean;
  issueDetails: string[];
};

type DashboardData = {
  employees: Employee[];
  submissions: Submission[];
  branches: string[];
  meta: {
    currentWeekKey: string;
    lastWeekKey: string;
    currentYear: number;
    availableYears: number[];
    generatedAt: string;
  };
};

const colors = {
  bg: "#ffffff",
  card: "#ffffff",
  panel: "#f8fafc",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
  blue: "#0f172a",
  accent: "#dc2626",
};

type StatusFilter = "all" | "submitted" | "notSubmitted";

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  color: colors.muted,
  textTransform: "uppercase",
  marginBottom: 4,
  display: "block",
};

const selectStyle: CSSProperties = {
  background: "#ffffff",
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  minWidth: 150,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginTop: 28,
  marginBottom: 12,
  color: colors.muted,
};

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "14px 16px",
        flex: "1 1 140px",
        minWidth: 140,
      }}
    >
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? colors.text }}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [year, setYear] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || "Failed to load data");
        } else {
          setData(json);
          setError(null);
          setYear((y) => y ?? json.meta.currentYear);
          setSelectedWeek((w) => w ?? json.meta.currentWeekKey);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const weeksOfYear = useMemo(() => (year ? listWeeksOfYear(year) : []), [year]);

  const submittedWeeksByEmployee = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    for (const s of data.submissions) {
      if (!map.has(s.employeeId)) map.set(s.employeeId, new Set());
      map.get(s.employeeId)!.add(s.weekKey);
    }
    return map;
  }, [data]);

  const issuesByEmployeeWeek = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!data) return map;
    for (const s of data.submissions) {
      if (s.issueFlagged && s.issueDetails.length) {
        const key = `${s.employeeId}|${s.weekKey}`;
        const existing = map.get(key) ?? [];
        map.set(key, existing.concat(s.issueDetails));
      }
    }
    return map;
  }, [data]);

  const scopedEmployees = useMemo(() => {
    if (!data) return [];
    return branchFilter === "all" ? data.employees : data.employees.filter((e) => e.branch === branchFilter);
  }, [data, branchFilter]);

  const weeklyRates = useMemo(() => {
    return weeksOfYear.map((w) => {
      const required = scopedEmployees.length;
      const submitted = scopedEmployees.filter((e) => submittedWeeksByEmployee.get(e.id)?.has(w.key)).length;
      return {
        ...w,
        required,
        submitted,
        rate: required ? Math.round((submitted / required) * 100) : 0,
      };
    });
  }, [weeksOfYear, scopedEmployees, submittedWeeksByEmployee]);

  const selectedWeekInfo = weeksOfYear.find((w) => w.key === selectedWeek) ?? null;

  const employeeRows = useMemo(() => {
    if (!selectedWeek) return [];
    return scopedEmployees.map((e) => {
      const submitted = submittedWeeksByEmployee.get(e.id)?.has(selectedWeek) ?? false;
      const issueDetails = issuesByEmployeeWeek.get(`${e.id}|${selectedWeek}`) ?? [];
      return { ...e, submitted, issue: issueDetails.length > 0, issueDetails };
    });
  }, [scopedEmployees, submittedWeeksByEmployee, issuesByEmployeeWeek, selectedWeek]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "submitted") return employeeRows.filter((r) => r.submitted);
    if (statusFilter === "notSubmitted") return employeeRows.filter((r) => !r.submitted);
    return employeeRows;
  }, [employeeRows, statusFilter]);

  const branchRows = useMemo(() => {
    if (!data || !selectedWeek) return [];
    return data.branches.map((branch) => {
      const emps = data.employees.filter((e) => e.branch === branch);
      const submitted = emps.filter((e) => submittedWeeksByEmployee.get(e.id)?.has(selectedWeek)).length;
      return { branch, total: emps.length, submitted, notSubmitted: emps.length - submitted };
    });
  }, [data, selectedWeek, submittedWeeksByEmployee]);

  const summary = useMemo(() => {
    const total = employeeRows.length;
    const submitted = employeeRows.filter((r) => r.submitted).length;
    const issues = employeeRows.filter((r) => r.issue).length;
    return {
      total,
      submitted,
      notSubmitted: total - submitted,
      issues,
      rate: total ? Math.round((submitted / total) * 100) : 0,
    };
  }, [employeeRows]);

  function handleNotSubmittedLastWeek() {
    if (!data) return;
    setYear(Number(data.meta.lastWeekKey.slice(0, 4)));
    setSelectedWeek(data.meta.lastWeekKey);
    setStatusFilter("notSubmitted");
  }

  const maxTotal = Math.max(...branchRows.map((b) => b.total), 1);

  if (loading) {
    return (
      <div
        style={{
          background: colors.bg,
          color: colors.muted,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        Loading live board data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: colors.bg, color: colors.red, minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        Error loading dashboard: {error}
      </div>
    );
  }

  return (
    <main style={{ background: colors.bg, color: colors.text, minHeight: "100vh", padding: "24px 20px 60px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: colors.text,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            VI
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>Vehicle Inspection Dashboard</h1>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: colors.accent, textTransform: "uppercase" }}>
              Fleet Compliance · Field Operations
            </div>
          </div>
          <span style={{ fontSize: 12, color: colors.muted }}>
            Updated {new Date(data.meta.generatedAt).toLocaleString()}
          </span>
        </div>

        <div
          style={{
            marginTop: 20,
            background: colors.panel,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: 16,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div>
            <label style={labelStyle}>Branch / Office</label>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={selectStyle}>
              <option value="all">All branches</option>
              {data.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Year</label>
            <select value={year ?? data.meta.currentYear} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
              {data.meta.availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Week</label>
            <select
              value={selectedWeek ?? ""}
              onChange={(e) => setSelectedWeek(e.target.value)}
              style={{ ...selectStyle, minWidth: 220 }}
            >
              {weeklyRates.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label} — {w.rate}%
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={selectStyle}>
              <option value="all">All employees</option>
              <option value="submitted">Performed inspection</option>
              <option value="notSubmitted">Didn&apos;t perform inspection</option>
            </select>
          </div>

          <button
            onClick={handleNotSubmittedLastWeek}
            style={{
              background: colors.accent,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "9px 14px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Didn&apos;t Submit Last Week ({data.meta.lastWeekKey})
          </button>

          {selectedWeekInfo && (
            <span style={{ fontSize: 12, color: colors.muted }}>Viewing {selectedWeekInfo.label}</span>
          )}
        </div>

        <div style={{ height: 2, background: colors.text, marginTop: 18, marginBottom: 18 }} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatCard label="Required" value={summary.total} />
          <StatCard label="Submitted" value={summary.submitted} color={colors.green} />
          <StatCard label="Not Submitted" value={summary.notSubmitted} color={colors.red} />
          <StatCard label="Issues Flagged" value={summary.issues} color={colors.amber} />
          <StatCard label="Compliance Rate" value={`${summary.rate}%`} color={colors.accent} />
        </div>

        <h2 style={sectionTitleStyle}>Weekly Compliance — {year}</h2>
        <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 8, alignItems: "flex-end", height: 90 }}>
          {weeklyRates.map((w) => {
            const isSelected = w.key === selectedWeek;
            const isCurrent = w.key === data.meta.currentWeekKey;
            return (
              <div
                key={w.key}
                onClick={() => setSelectedWeek(w.key)}
                title={`${w.label}: ${w.submitted}/${w.required} (${w.rate}%)`}
                style={{
                  width: 12,
                  height: Math.max(4, (w.rate / 100) * 70),
                  background: w.rate >= 80 ? colors.green : w.rate >= 50 ? colors.amber : colors.red,
                  borderRadius: 2,
                  cursor: "pointer",
                  outline: isSelected ? `2px solid ${colors.accent}` : isCurrent ? `1px dashed ${colors.muted}` : "none",
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>

        <h2 style={sectionTitleStyle}>By Branch — {selectedWeekInfo?.label}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {branchRows.map((b) => (
            <div key={b.branch}>
              <div
                onClick={() => setBranchFilter(branchFilter === b.branch ? "all" : b.branch)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 4,
                  cursor: "pointer",
                  color: branchFilter === b.branch ? colors.accent : colors.text,
                }}
              >
                <span style={{ fontWeight: branchFilter === b.branch ? 700 : 500 }}>{b.branch}</span>
                <span style={{ color: colors.muted }}>
                  {b.submitted}/{b.total}
                </span>
              </div>
              <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: colors.border }}>
                <div style={{ width: `${(b.submitted / maxTotal) * 100}%`, background: colors.green }} />
                <div style={{ width: `${(b.notSubmitted / maxTotal) * 100}%`, background: colors.red }} />
              </div>
            </div>
          ))}
        </div>

        <h2 style={sectionTitleStyle}>Employees ({filteredRows.length})</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filteredRows
            .slice()
            .sort((a, b) => a.branch.localeCompare(b.branch) || a.name.localeCompare(b.name))
            .map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ color: colors.muted, fontSize: 12 }}>
                    {r.branch}
                    {r.manager ? ` · ${r.manager}` : ""}
                  </div>
                  {r.issue && (
                    <div style={{ color: colors.amber, fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                      {r.issueDetails.join(", ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: r.submitted ? colors.green : colors.red, fontWeight: 700, fontSize: 12 }}>
                    {r.submitted ? "Submitted" : "Not Submitted"}
                  </span>
                </div>
              </div>
            ))}
          {filteredRows.length === 0 && (
            <div style={{ color: colors.muted, fontSize: 13 }}>No employees match the current filters.</div>
          )}
        </div>
      </div>
    </main>
  );
}
