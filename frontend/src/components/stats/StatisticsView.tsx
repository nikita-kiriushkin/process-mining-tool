"use client";

import { useMemo, useState } from "react";
import type { ProcessResponse, GraphNode, GraphEdge, DimensionSlice } from "@/lib/types";
import { formatCount, formatDuration } from "@/lib/utils";

const SYNTHETIC_PREFIX = "[Synthetic]";

interface Props {
  data: ProcessResponse;
  isDark: boolean;
}

export function StatisticsView({ data, isDark }: Props) {
  const { graph, summary, statistics } = data;
  const totalCases = summary.total_cases;

  // Node lookup map for O(1) access in conversion table
  const nodeMap = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes]
  );

  // Activities ordered by avg_position, synthetic nodes excluded
  const orderedActivities = useMemo(
    () =>
      [...graph.nodes]
        .filter((n) => !n.id.startsWith(SYNTHETIC_PREFIX))
        .sort((a, b) => a.avg_position - b.avg_position),
    [graph.nodes]
  );

  // Edges, synthetic excluded
  const realEdges = useMemo(
    () =>
      graph.edges.filter(
        (e) =>
          !e.source.startsWith(SYNTHETIC_PREFIX) &&
          !e.target.startsWith(SYNTHETIC_PREFIX)
      ),
    [graph.edges]
  );

  // Overall completion: % of cases reaching the most-frequent end activity
  const overallCompletion = useMemo(() => {
    if (!summary.most_frequent_end) return null;
    const endNode = graph.nodes.find((n) => n.id === summary.most_frequent_end);
    if (!endNode || totalCases === 0) return null;
    return endNode.end_count / totalCases;
  }, [graph.nodes, summary.most_frequent_end, totalCases]);

  // Dimensional breakdown state
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

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* ── Top-level metric cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Cases" value={formatCount(totalCases)} isDark={isDark} />
          <MetricCard
            label="Activities"
            value={formatCount(orderedActivities.length)}
            isDark={isDark}
          />
          <MetricCard
            label="Avg Case Length"
            value={summary.avg_case_length.toFixed(1) + " steps"}
            isDark={isDark}
          />
          {overallCompletion !== null && (
            <MetricCard
              label={`Reach "${summary.most_frequent_end}"`}
              value={pct(overallCompletion)}
              isDark={isDark}
              highlight={
                overallCompletion >= 0.7 ? "green" : overallCompletion >= 0.4 ? "amber" : "red"
              }
            />
          )}
        </div>

        {/* ── Activity Funnel ───────────────────────────────────────────────── */}
        <Section title="Activity Reach & Dropout" isDark={isDark}>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Percentage of all {formatCount(totalCases)} cases that passed through each activity,
            ordered by average process position. Exit % shows how often cases end at that step.
          </p>
          <div className="space-y-2.5">
            {orderedActivities.map((node) => {
              const reach = totalCases > 0 ? node.case_count / totalCases : 0;
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
                  const exitRate =
                    node.case_count > 0 ? node.end_count / node.case_count : 0;
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
        <Section title="Step Conversion Rates" isDark={isDark}>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            For each transition, conversion = transitions ÷ source-activity case count.
            Values above 100% indicate loops (same case traverses the step multiple times).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <Th align="left">Transition</Th>
                  <Th>Count</Th>
                  <Th>Conversion</Th>
                  <Th>Avg Time</Th>
                  <Th>Median</Th>
                  <Th>Min</Th>
                  <Th>Max</Th>
                </tr>
              </thead>
              <tbody>
                {[...realEdges]
                  .sort((a, b) => b.count - a.count)
                  .map((edge) => {
                    const src = nodeMap.get(edge.source);
                    const convRate =
                      src && src.case_count > 0 ? edge.count / src.case_count : 0;
                    return (
                      <tr
                        key={edge.id}
                        className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          <span className="truncate max-w-[120px] inline-block align-bottom">
                            {edge.source}
                          </span>
                          <span className="text-gray-400 mx-1.5">→</span>
                          <span className="truncate max-w-[120px] inline-block align-bottom">
                            {edge.target}
                          </span>
                        </td>
                        <Td>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {formatCount(edge.count)}
                          </span>
                        </Td>
                        <Td>
                          <ConversionBadge rate={convRate} />
                        </Td>
                        <Td>{formatDuration(edge.avg_duration_ms)}</Td>
                        <Td>{formatDuration(edge.median_duration_ms)}</Td>
                        <Td>{formatDuration(edge.min_duration_ms)}</Td>
                        <Td>{formatDuration(edge.max_duration_ms)}</Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Section>

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

// ── Funnel row ─────────────────────────────────────────────────────────────────

function FunnelRow({
  label,
  reach,
  caseCount,
  exitRate,
  isDark: _isDark,
}: {
  label: string;
  reach: number;
  caseCount: number;
  exitRate: number;
  isDark: boolean;
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
        <div
          className="h-full rounded"
          style={{ width: `${reach * 100}%`, backgroundColor: barColor }}
        />
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
  orderedActivities,
  totalCases,
  dimSlices,
}: {
  orderedActivities: GraphNode[];
  totalCases: number;
  dimSlices: DimensionSlice[];
}) {
  // Limit to 8 segment columns so the table stays readable
  const visibleSlices = dimSlices.slice(0, 8);
  const hiddenCount = dimSlices.length - visibleSlices.length;

  // Build per-activity lookup per slice for O(1) access
  const sliceMaps = useMemo(
    () =>
      visibleSlices.map((slice) => ({
        slice,
        map: new Map(slice.activities.map((a) => [a.activity, a])),
      })),
    [visibleSlices]
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
                {/* "All" column — uses main graph data */}
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
                    <td
                      key={slice.value}
                      className="py-2 px-3 text-right tabular-nums whitespace-nowrap"
                    >
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

// ── Small primitives ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
  isDark: _isDark,
}: {
  title: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  isDark: _isDark,
  highlight,
}: {
  label: string;
  value: string;
  isDark: boolean;
  highlight?: "green" | "amber" | "red";
}) {
  const valueClass =
    highlight === "green"
      ? "text-green-600 dark:text-green-400"
      : highlight === "amber"
      ? "text-amber-500 dark:text-amber-400"
      : highlight === "red"
      ? "text-red-500 dark:text-red-400"
      : "text-gray-900 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums leading-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

function Th({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`py-2 px-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
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

function ConversionBadge({ rate }: { rate: number }) {
  const pctVal = rate * 100;
  const color =
    pctVal >= 70
      ? "text-green-600 dark:text-green-400"
      : pctVal >= 40
      ? "text-amber-500 dark:text-amber-400"
      : "text-red-500 dark:text-red-400";
  return <span className={color}>{pctVal.toFixed(1)}%</span>;
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
