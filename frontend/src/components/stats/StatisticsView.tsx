"use client";

import { useMemo, useState } from "react";
import type { ProcessResponse, GraphNode, GraphEdge, DimensionSlice } from "@/lib/types";
import { formatCount, formatDuration } from "@/lib/utils";

const SYNTHETIC_PREFIX = "[Synthetic]";

const COL_W   = 88;
const ROW_H   = 44;
const ROW_H_COMPARE = 56;
const LABEL_W = 148;

interface CompareSet { dim: string; vals: string[] }

interface Props {
  data: ProcessResponse;
  isDark: boolean;
  activityOrder: string[];
  excludedActivities?: string[];
}

export function StatisticsView({ data, isDark, activityOrder, excludedActivities = [] }: Props) {
  const { graph, summary, statistics } = data;
  const totalCases = summary.total_cases;

  const excluded = useMemo(() => new Set(excludedActivities), [excludedActivities]);

  const orderedActivities = useMemo(() => {
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const ordered = activityOrder
      .filter((id) => !id.startsWith(SYNTHETIC_PREFIX) && !excluded.has(id))
      .map((id) => nodeById.get(id))
      .filter((n): n is GraphNode => n !== undefined);
    const placed = new Set(ordered.map((n) => n.id));
    const rest = [...nodeById.values()]
      .filter((n) => !n.id.startsWith(SYNTHETIC_PREFIX) && !excluded.has(n.id) && !placed.has(n.id))
      .sort((a, b) => a.avg_position - b.avg_position);
    return [...ordered, ...rest];
  }, [graph.nodes, activityOrder, excluded]);

  const realEdges = useMemo(
    () =>
      graph.edges.filter(
        (e) =>
          !e.source.startsWith(SYNTHETIC_PREFIX) &&
          !e.target.startsWith(SYNTHETIC_PREFIX) &&
          !excluded.has(e.source) &&
          !excluded.has(e.target)
      ),
    [graph.edges, excluded]
  );

  const overallCompletion = useMemo(() => {
    if (!summary.most_frequent_end) return null;
    const endNode = graph.nodes.find((n) => n.id === summary.most_frequent_end);
    if (!endNode || totalCases === 0) return null;
    return endNode.end_count / totalCases;
  }, [graph.nodes, summary.most_frequent_end, totalCases]);

  // Dimensional breakdown
  const availableDims = useMemo(
    () => [...new Set(statistics.dimensional_breakdowns.map((s) => s.dimension))],
    [statistics.dimensional_breakdowns]
  );
  const [selectedDim, setSelectedDim] = useState<string | null>(null);
  const activeDim = selectedDim ?? availableDims[0] ?? null;
  const dimSlices = useMemo(
    () => statistics.dimensional_breakdowns.filter((s) => s.dimension === activeDim),
    [statistics.dimensional_breakdowns, activeDim]
  );

  const activityIds = useMemo(() => orderedActivities.map((n) => n.id), [orderedActivities]);

  // ── Step Conversion Rates controls ────────────────────────────────────────
  const [countDisplayMode, setCountDisplayMode] = useState<"absolute" | "share">("absolute");
  const [compareMode, setCompareMode] = useState(false);

  const firstDim = Object.keys(data.available_dimensions)[0] ?? "";
  const [setADim, setSetADim] = useState<string>(firstDim);
  const [setAVals, setSetAVals] = useState<string[]>([]);
  const [setBDim, setSetBDim] = useState<string>(firstDim);
  const [setBVals, setSetBVals] = useState<string[]>([]);

  const compareA: CompareSet | null = compareMode && setADim && setAVals.length > 0
    ? { dim: setADim, vals: setAVals } : null;
  const compareB: CompareSet | null = compareMode && setBDim && setBVals.length > 0
    ? { dim: setBDim, vals: setBVals } : null;

  const hasDimensions = Object.keys(data.available_dimensions).length > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* ── Metric cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Cases" value={formatCount(totalCases)} isDark={isDark} />
          <MetricCard label="Activities" value={formatCount(orderedActivities.length)} isDark={isDark} />
          <MetricCard label="Avg Case Length" value={summary.avg_case_length.toFixed(1) + " steps"} isDark={isDark} />
          {overallCompletion !== null && (
            <MetricCard
              label={`Reach "${summary.most_frequent_end}"`}
              value={pct(overallCompletion)}
              isDark={isDark}
              highlight={overallCompletion >= 0.7 ? "green" : overallCompletion >= 0.4 ? "amber" : "red"}
            />
          )}
        </div>

        {/* ── Activity Reach & Dropout ──────────────────────────────────────── */}
        <Section title="Activity Reach & Dropout" isDark={isDark}>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Percentage of all {formatCount(totalCases)} cases that passed through each activity,
            ordered by average process position. Exit % shows how often cases end at that step.
          </p>
          <div className="space-y-2.5">
            {orderedActivities.map((node) => {
              const reach    = totalCases > 0 ? node.case_count / totalCases : 0;
              const exitRate = node.case_count > 0 ? node.end_count / node.case_count : 0;
              return (
                <FunnelRow
                  key={node.id}
                  label={node.label}
                  reach={reach}
                  caseCount={node.case_count}
                  exitRate={exitRate}
                  isDark={isDark}
                />
              );
            })}
          </div>
        </Section>

        {/* ── Activity Time Analysis ────────────────────────────────────────── */}
        <Section title="Activity Time Analysis" isDark={isDark}>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Wait time before entering each activity — the gap between the preceding event
            and this one within the same case.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <Th align="left">Activity</Th>
                  <Th>Cases</Th>
                  <Th>% of Total</Th>
                  <Th>Exit %</Th>
                  <Th>Avg Wait</Th>
                  <Th>Median</Th>
                  <Th>Min</Th>
                  <Th>Max</Th>
                </tr>
              </thead>
              <tbody>
                {orderedActivities.map((node) => {
                  const reachPct = totalCases > 0 ? (node.case_count / totalCases) * 100 : 0;
                  const exitRate = node.case_count > 0 ? node.end_count / node.case_count : 0;
                  return (
                    <tr
                      key={node.id}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                      <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">
                        {node.label}
                      </td>
                      <Td>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                          {formatCount(node.case_count)}
                        </span>
                      </Td>
                      <Td>{reachPct.toFixed(1)}%</Td>
                      <Td>
                        {exitRate > 0 ? (
                          <span className="text-orange-500">{pct(exitRate)}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </Td>
                      <Td>{formatDuration(node.avg_duration_before_ms)}</Td>
                      <Td>{formatDuration(node.median_duration_before_ms)}</Td>
                      <Td>{formatDuration(node.min_duration_before_ms)}</Td>
                      <Td>{formatDuration(node.max_duration_before_ms)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Step Conversion Rates ─────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Section header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Step Conversion Rates
            </h2>
            <div className="flex items-center gap-2">
              {hasDimensions && (
                <button
                  onClick={() => setCompareMode((m) => !m)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    compareMode
                      ? "bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300"
                      : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-violet-300 hover:text-violet-600"
                  }`}
                >
                  {compareMode ? "✕ Compare" : "⇄ Compare sets"}
                </button>
              )}
            </div>
          </div>

          <div className="p-5 space-y-6">
            {/* Comparison configurator */}
            {compareMode && hasDimensions && (
              <div className="rounded-lg border border-violet-100 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-900/10 p-4">
                <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-3">
                  Define two sets to compare
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <SetFilterPicker
                    label="A"
                    accentColor="#3b82f6"
                    dim={setADim}
                    vals={setAVals}
                    availableDimensions={data.available_dimensions}
                    onChangeDim={(d) => { setSetADim(d); setSetAVals([]); }}
                    onChangeVals={setSetAVals}
                    isDark={isDark}
                  />
                  <SetFilterPicker
                    label="B"
                    accentColor="#f97316"
                    dim={setBDim}
                    vals={setBVals}
                    availableDimensions={data.available_dimensions}
                    onChangeDim={(d) => { setSetBDim(d); setSetBVals([]); }}
                    onChangeVals={setSetBVals}
                    isDark={isDark}
                  />
                </div>
                {compareMode && (!compareA || !compareB) && (
                  <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-3">
                    Select at least one value for each set to activate comparison.
                  </p>
                )}
                {compareA && compareB && (
                  <p className="text-[10px] text-violet-600 dark:text-violet-300 mt-3">
                    Cell color reflects Set A − Set B difference: <span className="font-semibold text-blue-600 dark:text-blue-400">blue = A dominates</span>, <span className="font-semibold text-orange-500">orange = B dominates</span>.
                  </p>
                )}
              </div>
            )}

            {/* Transition Count table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Transition Count
                </p>
                {!(compareA && compareB) && (
                  <div className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden text-[11px]">
                    {(["absolute", "share"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setCountDisplayMode(m)}
                        className={`px-2.5 py-1 transition-colors ${
                          countDisplayMode === m
                            ? "bg-blue-500 text-white font-semibold"
                            : "bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600"
                        }`}
                      >
                        {m === "absolute" ? "#" : "Row %"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <TransitionTable
                activities={activityIds}
                edges={realEdges}
                mode="count"
                isDark={isDark}
                displayMode={countDisplayMode}
                compareA={compareA}
                compareB={compareB}
              />
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-700" />

            {/* Avg Transition Time table */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-3">
                Avg Transition Time
              </p>
              <TransitionTable
                activities={activityIds}
                edges={realEdges}
                mode="time"
                isDark={isDark}
                compareA={compareA}
                compareB={compareB}
              />
            </div>
          </div>
        </div>

        {/* ── Dimensional Breakdown ─────────────────────────────────────────── */}
        {availableDims.length > 0 && (
          <Section title="Dimensional Breakdown" isDark={isDark}>
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <span className="text-xs text-gray-500 dark:text-gray-400">Segment by:</span>
              {availableDims.map((dim) => (
                <button
                  key={dim}
                  onClick={() => setSelectedDim(dim)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeDim === dim
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {dim}
                </button>
              ))}
            </div>
            {dimSlices.length > 0 ? (
              <DimensionTable
                orderedActivities={orderedActivities}
                totalCases={totalCases}
                dimSlices={dimSlices}
              />
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No breakdown data for this dimension.
              </p>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Set filter picker ──────────────────────────────────────────────────────────

function SetFilterPicker({
  label,
  accentColor,
  dim,
  vals,
  availableDimensions,
  onChangeDim,
  onChangeVals,
  isDark,
}: {
  label: string;
  accentColor: string;
  dim: string;
  vals: string[];
  availableDimensions: Record<string, string[]>;
  onChangeDim: (d: string) => void;
  onChangeVals: (v: string[]) => void;
  isDark: boolean;
}) {
  const dimKeys = Object.keys(availableDimensions);
  const dimValues = availableDimensions[dim] ?? [];
  const valsSet = new Set(vals);

  function toggle(val: string) {
    const next = new Set(valsSet);
    if (next.has(val)) next.delete(val); else next.add(val);
    onChangeVals([...next]);
  }

  return (
    <div
      className="rounded-md p-3 border"
      style={{
        borderColor: accentColor + "55",
        backgroundColor: isDark ? accentColor + "11" : accentColor + "08",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: accentColor }}
        >
          {label}
        </span>
        <select
          value={dim}
          onChange={(e) => onChangeDim(e.target.value)}
          className="flex-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none"
        >
          {dimKeys.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1 max-h-36 overflow-y-auto">
        {dimValues.map((val) => (
          <label key={val} className="flex items-center gap-2 cursor-pointer group py-0.5">
            <input
              type="checkbox"
              checked={valsSet.has(val)}
              onChange={() => toggle(val)}
              className="h-3 w-3 flex-shrink-0 rounded"
              style={{ accentColor }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-white">
              {val}
            </span>
          </label>
        ))}
        {dimValues.length === 0 && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500">No values available.</p>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCompareCount(edge: GraphEdge, set: CompareSet): number {
  const dimCounts = edge.dimension_counts[set.dim] ?? {};
  return set.vals.reduce((sum, v) => sum + (dimCounts[v] ?? 0), 0);
}

function getCompareTime(edge: GraphEdge, set: CompareSet): number | null {
  const dimDurations = edge.dimension_durations[set.dim] ?? {};
  const dimCounts    = edge.dimension_counts[set.dim]    ?? {};
  let totalTime = 0, totalCount = 0;
  for (const v of set.vals) {
    const dur = dimDurations[v];
    const cnt = dimCounts[v] ?? 0;
    if (dur != null && cnt > 0) { totalTime += dur * cnt; totalCount += cnt; }
  }
  return totalCount > 0 ? totalTime / totalCount : null;
}

// ── Transition heatmap ─────────────────────────────────────────────────────────

function fmtShort(ms: number | null): string {
  if (ms === null || ms <= 0) return "—";
  const s = ms / 1000;
  if (s < 60)  return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 60)  return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24)  return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function TransitionTable({
  activities,
  edges,
  mode,
  isDark,
  displayMode = "absolute",
  compareA,
  compareB,
}: {
  activities: string[];
  edges: GraphEdge[];
  mode: "count" | "time";
  isDark: boolean;
  displayMode?: "absolute" | "share";
  compareA?: CompareSet | null;
  compareB?: CompareSet | null;
}) {
  const isComparing = !!(compareA && compareB);

  const cellMap = useMemo(() => {
    const m: Record<string, Record<string, GraphEdge>> = {};
    for (const e of edges) (m[e.source] ??= {})[e.target] = e;
    return m;
  }, [edges]);

  // Row totals for share mode
  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const e of edges) totals[e.source] = (totals[e.source] ?? 0) + e.count;
    return totals;
  }, [edges]);

  const rowSetATotals = useMemo(() => {
    if (!compareA) return {} as Record<string, number>;
    const totals: Record<string, number> = {};
    for (const e of edges) totals[e.source] = (totals[e.source] ?? 0) + getCompareCount(e, compareA);
    return totals;
  }, [edges, compareA]);

  const rowSetBTotals = useMemo(() => {
    if (!compareB) return {} as Record<string, number>;
    const totals: Record<string, number> = {};
    for (const e of edges) totals[e.source] = (totals[e.source] ?? 0) + getCompareCount(e, compareB);
    return totals;
  }, [edges, compareB]);

  // Max value for intensity scaling (non-comparison mode)
  const maxVal = useMemo(() => {
    if (isComparing) return 1;
    let mx = 1;
    for (const row of Object.values(cellMap)) {
      for (const edge of Object.values(row)) {
        let v: number;
        if (mode === "count") {
          v = displayMode === "share"
            ? edge.count / Math.max(rowTotals[edge.source] ?? 1, 1)
            : edge.count;
        } else {
          v = edge.avg_duration_ms ?? 0;
        }
        if (v > mx) mx = v;
      }
    }
    return mx;
  }, [cellMap, mode, displayMode, isComparing, rowTotals]);

  if (activities.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">No activities to display.</p>;
  }

  const rowH = isComparing ? ROW_H_COMPARE : ROW_H;

  const singleColorFn = (intensity: number): string => {
    if (mode === "count") {
      const [r1, g1, b1] = isDark ? [71, 85, 105]  : [219, 234, 254];
      const [r2, g2, b2] = isDark ? [147, 197, 253] : [29, 78, 216];
      return `rgb(${lerp(r1,r2,intensity)},${lerp(g1,g2,intensity)},${lerp(b1,b2,intensity)})`;
    } else {
      const [r1, g1, b1] = isDark ? [71, 85, 105]  : [255, 237, 213];
      const [r2, g2, b2] = isDark ? [253, 186, 116] : [194, 65, 12];
      return `rgb(${lerp(r1,r2,intensity)},${lerp(g1,g2,intensity)},${lerp(b1,b2,intensity)})`;
    }
  };

  // Diverging color for comparison: +1 = pure blue (A dominates), -1 = pure orange (B dominates)
  const diffColorFn = (normDiff: number): string => {
    const t = Math.abs(normDiff);
    if (normDiff >= 0) {
      // A dominates → blue
      const [r1, g1, b1] = isDark ? [30, 41, 59]  : [239, 246, 255];
      const [r2, g2, b2] = isDark ? [96, 165, 250] : [37, 99, 235];
      return `rgb(${lerp(r1,r2,t)},${lerp(g1,g2,t)},${lerp(b1,b2,t)})`;
    } else {
      // B dominates → orange
      const [r1, g1, b1] = isDark ? [30, 41, 59]  : [255, 247, 237];
      const [r2, g2, b2] = isDark ? [251, 146, 60] : [194, 65, 12];
      return `rgb(${lerp(r1,r2,t)},${lerp(g1,g2,t)},${lerp(b1,b2,t)})`;
    }
  };

  const emptyColor   = isDark ? "#475569" : "#d1d5db";
  const rowBorder    = isDark ? "#374151" : "#f3f4f6";
  const headerBg     = isDark ? "rgba(55,65,81,0.5)" : "#f8fafc";
  const stickyBg     = isDark ? "#1f2937" : "#ffffff";
  const labelColor   = isDark ? "#94a3b8" : "#6b7280";

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      <table className="border-collapse text-xs" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: LABEL_W }} />
          {activities.map((a) => <col key={a} style={{ width: COL_W }} />)}
        </colgroup>
        <thead>
          <tr style={{ background: headerBg, borderBottom: `1px solid ${rowBorder}` }}>
            <th
              style={{
                width: LABEL_W,
                padding: "10px 12px 10px 0",
                fontSize: 10,
                fontWeight: 600,
                color: labelColor,
                textAlign: "right",
                position: "sticky",
                left: 0,
                background: headerBg,
                zIndex: 2,
                borderRight: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
              }}
            >
              source ↓ &nbsp; target →
            </th>
            {activities.map((act) => (
              <th
                key={act}
                style={{
                  width: COL_W,
                  padding: "10px 4px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: labelColor,
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={act}
              >
                {act}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activities.map((src, srcIdx) => (
            <tr
              key={src}
              style={{
                borderBottom: `1px solid ${rowBorder}`,
                background: srcIdx % 2 === 0
                  ? (isDark ? "transparent" : "transparent")
                  : (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.012)"),
              }}
            >
              <td
                style={{
                  maxWidth: LABEL_W,
                  fontSize: 11,
                  fontWeight: 500,
                  textAlign: "right",
                  paddingRight: 12,
                  height: rowH,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: labelColor,
                  position: "sticky",
                  left: 0,
                  background: srcIdx % 2 === 0
                    ? stickyBg
                    : (isDark ? "#202c3b" : "#fafafa"),
                  zIndex: 1,
                  borderRight: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                }}
                title={src}
              >
                {src}
              </td>

              {activities.map((tgt) => {
                const edge = cellMap[src]?.[tgt];

                if (!edge) {
                  return (
                    <td
                      key={tgt}
                      className="text-center"
                      style={{ color: emptyColor, fontSize: 11, height: rowH }}
                    >
                      —
                    </td>
                  );
                }

                // ── Comparison mode ────────────────────────────────────────
                if (isComparing) {
                  let aVal: number | null, bVal: number | null;
                  let aLabel: string, bLabel: string;

                  if (mode === "count") {
                    const aRaw = getCompareCount(edge, compareA!);
                    const bRaw = getCompareCount(edge, compareB!);
                    if (displayMode === "share") {
                      const aTot = rowSetATotals[src] ?? 1;
                      const bTot = rowSetBTotals[src] ?? 1;
                      aVal = aTot > 0 ? aRaw / aTot : null;
                      bVal = bTot > 0 ? bRaw / bTot : null;
                      aLabel = aVal != null ? (aVal * 100).toFixed(1) + "%" : "—";
                      bLabel = bVal != null ? (bVal * 100).toFixed(1) + "%" : "—";
                    } else {
                      aVal = aRaw;
                      bVal = bRaw;
                      aLabel = String(aRaw);
                      bLabel = String(bRaw);
                    }
                  } else {
                    aVal = getCompareTime(edge, compareA!);
                    bVal = getCompareTime(edge, compareB!);
                    aLabel = fmtShort(aVal);
                    bLabel = fmtShort(bVal);
                  }

                  const aNum = aVal ?? 0;
                  const bNum = bVal ?? 0;
                  const maxAB = Math.max(aNum, bNum, 1e-9);
                  const normDiff = (aNum - bNum) / maxAB;
                  const bothZero = aNum === 0 && bNum === 0;
                  const bgColor = bothZero ? "transparent" : diffColorFn(normDiff);

                  const tooltip = mode === "count"
                    ? `${src} → ${tgt}\nSet A: ${aLabel}  Set B: ${bLabel}`
                    : `${src} → ${tgt}\nSet A: ${formatDuration(aVal as number | null)}  Set B: ${formatDuration(bVal as number | null)}`;

                  return (
                    <td
                      key={tgt}
                      className="text-center"
                      style={{
                        height: rowH,
                        backgroundColor: bgColor,
                        cursor: "default",
                        verticalAlign: "middle",
                      }}
                      title={tooltip}
                    >
                      {bothZero ? (
                        <span style={{ color: emptyColor, fontSize: 11 }}>—</span>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-0.5" style={{ lineHeight: 1.3 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#3b82f6" }}>
                            {aLabel}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 500, color: "#f97316" }}>
                            {bLabel}
                          </span>
                        </div>
                      )}
                    </td>
                  );
                }

                // ── Normal mode ────────────────────────────────────────────
                let raw: number;
                let label: string;
                let tooltip: string;

                if (mode === "count") {
                  if (displayMode === "share") {
                    const rowTotal = rowTotals[src] ?? 1;
                    const share = rowTotal > 0 ? edge.count / rowTotal : 0;
                    raw = share;
                    label = (share * 100).toFixed(1) + "%";
                    tooltip = `${src} → ${tgt}: ${label} of outgoing (${edge.count} transitions)`;
                  } else {
                    raw = edge.count;
                    label = String(edge.count);
                    tooltip = `${src} → ${tgt}: ${edge.count} transitions`;
                  }
                } else {
                  raw = edge.avg_duration_ms ?? 0;
                  label = fmtShort(edge.avg_duration_ms);
                  tooltip = `${src} → ${tgt}: ${formatDuration(edge.avg_duration_ms)}`;
                }

                const intensity = raw / maxVal;

                return (
                  <td
                    key={tgt}
                    className="text-center"
                    style={{
                      fontSize: 11,
                      fontWeight: intensity > 0.5 ? 700 : 500,
                      color: singleColorFn(intensity),
                      cursor: "default",
                      height: rowH,
                    }}
                    title={tooltip}
                  >
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.min(1, Math.max(0, t)));
}

// ── Funnel row ─────────────────────────────────────────────────────────────────

function FunnelRow({
  label, reach, caseCount, exitRate, isDark: _isDark,
}: {
  label: string; reach: number; caseCount: number; exitRate: number; isDark: boolean;
}) {
  const barColor =
    exitRate > 0.5 ? "#f87171" : exitRate > 0.2 ? "#fb923c" : "#60a5fa";
  return (
    <div className="flex items-center gap-3 group">
      <div
        className="w-36 flex-shrink-0 text-xs text-right text-gray-600 dark:text-gray-300 truncate"
        title={label}
      >
        {label}
      </div>
      <div className="flex-1 relative h-6 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
        <div className="h-full rounded" style={{ width: `${reach * 100}%`, backgroundColor: barColor }} />
        <span className="absolute inset-0 flex items-center pl-2 text-[10px] font-semibold text-white mix-blend-luminosity">
          {(reach * 100).toFixed(1)}%
        </span>
      </div>
      <div className="w-24 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
        {formatCount(caseCount)} cases
      </div>
      <div className="w-20 flex-shrink-0 text-xs tabular-nums">
        {exitRate > 0 ? (
          <span className="text-orange-500">↓ {pct(exitRate)}</span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">—</span>
        )}
      </div>
    </div>
  );
}

// ── Dimensional breakdown table ────────────────────────────────────────────────

function DimensionTable({
  orderedActivities, totalCases, dimSlices,
}: {
  orderedActivities: GraphNode[]; totalCases: number; dimSlices: DimensionSlice[];
}) {
  const visibleSlices = dimSlices.slice(0, 8);
  const hiddenCount   = dimSlices.length - visibleSlices.length;

  const sliceMaps = useMemo(
    () => visibleSlices.map((slice) => ({
      slice,
      map: new Map(slice.activities.map((a) => [a.activity, a])),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dimSlices]
  );

  return (
    <>
      {hiddenCount > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          Showing {visibleSlices.length} of {dimSlices.length} segments (top by case count).
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <Th align="left">Activity</Th>
              <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                All ({formatCount(totalCases)})
              </th>
              {sliceMaps.map(({ slice }) => (
                <th
                  key={slice.value}
                  className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  {slice.value}
                  <span className="text-gray-400 font-normal ml-1">
                    ({formatCount(slice.total_cases)})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedActivities.map((act) => (
              <tr
                key={act.id}
                className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/40"
              >
                <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">
                  {act.label}
                </td>
                <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {totalCases > 0 ? ((act.case_count / totalCases) * 100).toFixed(1) : 0}%
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 ml-1">
                    ({formatCount(act.case_count)})
                  </span>
                </td>
                {sliceMaps.map(({ slice, map }) => {
                  const actStats = map.get(act.id);
                  return (
                    <td key={slice.value} className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                      {actStats ? (
                        <>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">
                            {(actStats.pct_of_segment * 100).toFixed(1)}%
                          </span>
                          <span className="text-gray-400 dark:text-gray-500 ml-1">
                            ({formatCount(actStats.case_count)})
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Primitives ─────────────────────────────────────────────────────────────────

function Section({ title, children, isDark: _isDark }: { title: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function MetricCard({ label, value, isDark: _isDark, highlight }: {
  label: string; value: string; isDark: boolean; highlight?: "green" | "amber" | "red";
}) {
  const valueClass =
    highlight === "green" ? "text-green-600 dark:text-green-400" :
    highlight === "amber" ? "text-amber-500 dark:text-amber-400" :
    highlight === "red"   ? "text-red-500 dark:text-red-400"     :
                            "text-gray-900 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums leading-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap ${align === "left" ? "text-left" : "text-right"}`}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-2 px-3 text-right text-gray-500 dark:text-gray-400 tabular-nums">
      {children}
    </td>
  );
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
