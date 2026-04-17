"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Loader2, AlertCircle, ArrowLeft, RefreshCw, Moon, Sun, ChevronDown } from "lucide-react";
import { processEventLog } from "@/lib/api";
import { formatCount, formatDuration, formatPercent } from "@/lib/utils";
import { useUploadStore } from "@/store/uploadStore";
import { useExploreStore } from "@/store/exploreStore";
import { Button } from "@/components/ui/Button";
import type {
  ColumnMapping,
  ProcessFilters,
  ProcessResponse,
  SelectedElement,
  GraphNode,
  GraphEdge,
  ProcessGraph as ProcessGraphType,
} from "@/lib/types";

// Cytoscape uses browser APIs — must be loaded client-side only
const ProcessGraph = dynamic(
  async () => {
    const { ProcessGraph } = await import("@/components/graph/ProcessGraph");
    return ProcessGraph;
  },
  { ssr: false, loading: () => <GraphLoadingSkeleton /> }
);

export default function ExplorePage() {
  const router = useRouter();
  const { sessionId, columnMapping } = useUploadStore();
  const { filters, setFilters, resetFilters, setProcessData, selectedElement, setSelectedElement } =
    useExploreStore();

  // Guard: must have a session and mapping
  useEffect(() => {
    if (!sessionId || !columnMapping.case_id) {
      router.replace("/upload");
    }
  }, [sessionId, columnMapping, router]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["process", sessionId, columnMapping, filters],
    queryFn: () => processEventLog(sessionId!, columnMapping as ColumnMapping, filters),
    enabled: !!sessionId && !!columnMapping.case_id,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (data) setProcessData(data);
  }, [data, setProcessData]);

  // Dark mode toggle
  const [darkMode, setDarkMode] = useState(false);

  // Resizable panel sizes (px)
  const [filterWidth, setFilterWidth] = useState(256);
  const [detailWidth, setDetailWidth] = useState(288);
  const [variantsHeight, setVariantsHeight] = useState(192);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    return () => {
      // Clean up when leaving the page
      document.documentElement.classList.remove("dark");
    };
  }, [darkMode]);

  // Happy-path edge ids: consecutive pairs in the most-frequent variant
  const happyPathEdgeIds = useMemo(() => {
    if (!data?.variants?.length) return new Set<string>();
    const top = data.variants[0];
    const ids = new Set<string>();
    for (let i = 0; i < top.activities.length - 1; i++) {
      ids.add(`${top.activities[i]}→${top.activities[i + 1]}`);
    }
    return ids;
  }, [data]);

  // Loop edge ids: self-loops where source === target
  const loopEdgeIds = useMemo(
    () => new Set((data?.graph?.edges ?? []).filter((e) => e.source === e.target).map((e) => e.id)),
    [data]
  );

  if (!sessionId || !columnMapping.case_id) return null;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Top bar */}
      <header className="h-14 flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex items-center px-4 gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/map")} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Mapping
        </Button>
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-600" />
        <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Process Mining Tool</h1>

        {data && (
          <>
            <div className="h-5 w-px bg-gray-200 dark:bg-gray-600" />
            <SummaryChips data={data} />
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {isLoading && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
          {data && (
            <Button variant="ghost" size="sm" onClick={() => refetch()} title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDarkMode((d) => !d)}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Filter panel ── */}
        <aside
          style={{ width: filterWidth }}
          className="flex-shrink-0 bg-white dark:bg-gray-800 overflow-y-auto"
        >
          <div className="p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Filters
            </p>
            {data ? (
              <FilterPanel
                data={data}
                filters={filters}
                setFilters={setFilters}
                resetFilters={resetFilters}
              />
            ) : (
              <div className="text-xs text-gray-400">Loading…</div>
            )}
          </div>
        </aside>

        <ResizeHandle
          direction="vertical"
          onDelta={(d) => setFilterWidth((w) => Math.max(160, Math.min(400, w + d)))}
        />

        {/* ── Center: graph area ── */}
        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          {isLoading && <LoadingState />}
          {isError && (
            <ErrorState
              message={error instanceof Error ? error.message : "Unknown error"}
              onRetry={() => refetch()}
            />
          )}
          {data && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 relative min-h-0">
                <ProcessGraph
                  graph={data.graph}
                  selectedElement={selectedElement}
                  onSelectElement={setSelectedElement}
                  happyPathEdgeIds={happyPathEdgeIds}
                  loopEdgeIds={loopEdgeIds}
                  isDark={darkMode}
                />
              </div>
              <ResizeHandle
                direction="horizontal"
                onDelta={(d) => setVariantsHeight((h) => Math.max(80, Math.min(400, h - d)))}
              />
              <div
                style={{ height: variantsHeight }}
                className="flex-shrink-0 overflow-y-auto bg-white dark:bg-gray-800"
              >
                <VariantsTable variants={data.variants} />
              </div>
            </div>
          )}
        </main>

        <ResizeHandle
          direction="vertical"
          onDelta={(d) => setDetailWidth((w) => Math.max(200, Math.min(500, w - d)))}
        />

        {/* ── Detail panel ── */}
        <aside
          style={{ width: detailWidth }}
          className="flex-shrink-0 bg-white dark:bg-gray-800 overflow-y-auto"
        >
          <DetailPanel selectedElement={selectedElement} graph={data?.graph ?? null} />
        </aside>
      </div>
    </div>
  );
}

// ── Summary chips ──────────────────────────────────────────────────────────

function SummaryChips({ data }: { data: ProcessResponse }) {
  const { summary } = data;
  return (
    <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300 overflow-x-auto">
      <Chip label="Cases" value={formatCount(summary.total_cases)} />
      <Chip label="Events" value={formatCount(summary.total_events)} />
      <Chip label="Avg length" value={summary.avg_case_length.toFixed(1)} />
      <Chip label="Start" value={summary.most_frequent_start} />
      <Chip label="End" value={summary.most_frequent_end} />
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-gray-400 dark:text-gray-500">{label}:</span>
      <span className="font-semibold text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  );
}

// ── Filter panel ───────────────────────────────────────────────────────────

interface FilterPanelProps {
  data: ProcessResponse;
  filters: ProcessFilters;
  setFilters: (f: Partial<ProcessFilters>) => void;
  resetFilters: () => void;
}

function FilterPanel({ data, filters, setFilters, resetFilters }: FilterPanelProps) {
  // Date range — commit immediately on change
  const [dateFrom, setDateFrom] = useState(filters.date_from ?? "");
  const [dateTo, setDateTo] = useState(filters.date_to ?? "");

  // Activity exclusion — unchecked = excluded
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(filters.exclude_activities ?? [])
  );

  // Min edge frequency slider — commit on mouse-up to avoid rapid re-fetches
  const maxEdge = useMemo(
    () => (data.graph.edges.length > 0 ? Math.max(...data.graph.edges.map((e) => e.count)) : 1),
    [data.graph.edges]
  );
  const [minFreq, setMinFreq] = useState(filters.min_edge_frequency ?? 1);

  // Variant selection
  const [selVariants, setSelVariants] = useState<Set<number>>(
    () => new Set(filters.variant_ids ?? [])
  );

  // Dimension filters
  const [dimSel, setDimSel] = useState<Record<string, Set<string>>>(
    () =>
      Object.fromEntries(
        Object.keys(data.available_dimensions).map((d) => [
          d,
          new Set<string>(filters.dimension_filters?.[d] ?? []),
        ])
      )
  );

  // Case ID filter — one ID per line (or space-separated); committed on blur
  const [caseIdInput, setCaseIdInput] = useState(() =>
    (filters.case_ids ?? []).join("\n")
  );

  function parseCaseIds(raw: string): string[] {
    return [...new Set(raw.split(/[\n\r\s,]+/).map((s) => s.trim()).filter(Boolean))];
  }

  function commitCaseIds(raw: string) {
    const ids = parseCaseIds(raw);
    setFilters({ case_ids: ids.length > 0 ? ids : undefined });
  }

  const hasActive =
    !!filters.date_from ||
    !!filters.date_to ||
    (filters.exclude_activities?.length ?? 0) > 0 ||
    (filters.min_edge_frequency ?? 1) > 1 ||
    (filters.variant_ids?.length ?? 0) > 0 ||
    Object.values(filters.dimension_filters ?? {}).some((v) => v.length > 0) ||
    (filters.case_ids?.length ?? 0) > 0;

  function handleReset() {
    setDateFrom("");
    setDateTo("");
    setExcluded(new Set());
    setMinFreq(1);
    setSelVariants(new Set());
    setDimSel(
      Object.fromEntries(Object.keys(data.available_dimensions).map((d) => [d, new Set<string>()]))
    );
    setCaseIdInput("");
    resetFilters();
  }

  function toggleActivity(activity: string, checked: boolean) {
    const next = new Set(excluded);
    if (checked) next.delete(activity);
    else next.add(activity);
    setExcluded(next);
    setFilters({ exclude_activities: next.size > 0 ? [...next] : undefined });
  }

  function commitSlider(val: number) {
    setMinFreq(val);
    setFilters({ min_edge_frequency: val > 1 ? val : undefined });
  }

  function toggleVariant(id: number, checked: boolean) {
    const next = new Set(selVariants);
    if (checked) next.add(id);
    else next.delete(id);
    setSelVariants(next);
    setFilters({ variant_ids: next.size > 0 ? [...next] : undefined });
  }

  function toggleDim(dim: string, val: string, checked: boolean) {
    const nextSet = new Set(dimSel[dim] ?? []);
    if (checked) nextSet.add(val);
    else nextSet.delete(val);
    const nextAll = { ...dimSel, [dim]: nextSet };
    setDimSel(nextAll);
    const forStore: Record<string, string[]> = {};
    for (const [d, s] of Object.entries(nextAll)) {
      if (s.size > 0) forStore[d] = [...s];
    }
    setFilters({ dimension_filters: Object.keys(forStore).length > 0 ? forStore : undefined });
  }

  const dateMin = data.summary.date_min.slice(0, 10);
  const dateMax = data.summary.date_max.slice(0, 10);

  return (
    <div className="space-y-0">
      {/* ── Case IDs ── */}
      <FilterSection title="Case IDs">
        <textarea
          rows={3}
          value={caseIdInput}
          onChange={(e) => setCaseIdInput(e.target.value)}
          onBlur={(e) => commitCaseIds(e.target.value)}
          placeholder={"Paste IDs, one per line"}
          className="w-full text-xs font-mono border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1.5 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-gray-300 dark:placeholder:text-gray-500"
        />
        {parseCaseIds(caseIdInput).length > 0 && (
          <p className="text-[10px] text-blue-600 mt-1">
            {parseCaseIds(caseIdInput).length} case{parseCaseIds(caseIdInput).length !== 1 ? "s" : ""} selected
          </p>
        )}
      </FilterSection>

      {/* ── Date range ── */}
      <FilterSection title="Date Range">
        <div className="space-y-2">
          <div>
            <p className="text-[10px] text-gray-400 mb-0.5">From</p>
            <input
              type="date"
              value={dateFrom}
              min={dateMin}
              max={dateMax}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1.5 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              onChange={(e) => {
                setDateFrom(e.target.value);
                setFilters({ date_from: e.target.value || undefined });
              }}
            />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 mb-0.5">To</p>
            <input
              type="date"
              value={dateTo}
              min={dateMin}
              max={dateMax}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1.5 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              onChange={(e) => {
                setDateTo(e.target.value);
                setFilters({ date_to: e.target.value || undefined });
              }}
            />
          </div>
          <p className="text-[10px] text-gray-400">
            Data: {dateMin} → {dateMax}
          </p>
        </div>
      </FilterSection>

      {/* ── Activities ── */}
      <FilterSection title={`Activities (${data.available_activities.length})`}>
        <div className="space-y-0.5 max-h-44 overflow-y-auto pr-0.5">
          {data.available_activities.map((act) => (
            <label key={act} className="flex items-start gap-2 cursor-pointer group py-1">
              <input
                type="checkbox"
                checked={!excluded.has(act)}
                onChange={(e) => toggleActivity(act, e.target.checked)}
                className="mt-0.5 h-3 w-3 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
              />
              <span className="text-xs text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white leading-tight break-words min-w-0">
                {act}
              </span>
            </label>
          ))}
        </div>
        {excluded.size > 0 && (
          <p className="text-[10px] text-amber-600 mt-1.5">{excluded.size} excluded</p>
        )}
      </FilterSection>

      {/* ── Min edge frequency ── */}
      {maxEdge > 1 && (
        <FilterSection title="Min Edge Frequency">
          <div className="space-y-2">
            <input
              type="range"
              min={1}
              max={maxEdge}
              step={1}
              value={minFreq}
              className="w-full h-1.5 accent-blue-600 cursor-pointer"
              onChange={(e) => setMinFreq(Number(e.target.value))}
              onMouseUp={(e) => commitSlider(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => commitSlider(Number((e.target as HTMLInputElement).value))}
            />
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>1</span>
              <span className="text-blue-600 font-semibold">{minFreq}×</span>
              <span>{maxEdge}</span>
            </div>
          </div>
        </FilterSection>
      )}

      {/* ── Variants ── */}
      {data.variants.length > 1 && (
        <FilterSection title={`Variants (${data.variants.length})`}>
          <div className="space-y-0.5 max-h-40 overflow-y-auto pr-0.5">
            {data.variants.slice(0, 10).map((v) => (
              <label key={v.variant_id} className="flex items-start gap-2 cursor-pointer group py-1">
                <input
                  type="checkbox"
                  checked={selVariants.has(v.variant_id)}
                  onChange={(e) => toggleVariant(v.variant_id, e.target.checked)}
                  className="mt-0.5 h-3 w-3 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white leading-tight min-w-0">
                  <span className="text-gray-400 mr-1">#{v.variant_id}</span>
                  <span className="break-words">{v.activities.join(" → ")}</span>
                  <span className="text-gray-400 ml-1">({formatCount(v.count)})</span>
                </span>
              </label>
            ))}
          </div>
          {selVariants.size > 0 && (
            <p className="text-[10px] text-blue-600 mt-1.5">
              {selVariants.size} of {data.variants.length} selected
            </p>
          )}
        </FilterSection>
      )}

      {/* ── Dimension filters ── */}
      {Object.entries(data.available_dimensions).map(([dim, values]) => (
        <FilterSection key={dim} title={dim.charAt(0).toUpperCase() + dim.slice(1)}>
          <div className="space-y-0.5 max-h-32 overflow-y-auto pr-0.5">
            {values.map((val) => (
              <label key={val} className="flex items-start gap-2 cursor-pointer group py-1">
                <input
                  type="checkbox"
                  checked={dimSel[dim]?.has(val) ?? false}
                  onChange={(e) => toggleDim(dim, val, e.target.checked)}
                  className="mt-0.5 h-3 w-3 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white leading-tight">
                  {val}
                </span>
              </label>
            ))}
          </div>
          {(dimSel[dim]?.size ?? 0) > 0 && (
            <p className="text-[10px] text-blue-600 mt-1.5">{dimSel[dim].size} selected</p>
          )}
        </FilterSection>
      ))}

      {/* ── Reset ── */}
      <div className="pt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleReset}
          disabled={!hasActive}
          className="w-full"
        >
          Reset Filters
        </Button>
      </div>
    </div>
  );
}

// ── Resize handle ──────────────────────────────────────────────────────────

function ResizeHandle({
  direction,
  onDelta,
}: {
  direction: "vertical" | "horizontal";
  onDelta: (delta: number) => void;
}) {
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    let last = direction === "vertical" ? e.clientX : e.clientY;
    const onMove = (ev: MouseEvent) => {
      const curr = direction === "vertical" ? ev.clientX : ev.clientY;
      onDelta(curr - last);
      last = curr;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className={
        direction === "vertical"
          ? "w-1 flex-shrink-0 cursor-col-resize bg-gray-100 dark:bg-gray-700 hover:bg-blue-300 dark:hover:bg-blue-700 transition-colors"
          : "h-1 flex-shrink-0 cursor-row-resize bg-gray-100 dark:bg-gray-700 hover:bg-blue-300 dark:hover:bg-blue-700 transition-colors"
      }
    />
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pb-4 mb-4 border-b border-gray-50 dark:border-gray-700 last:border-0 last:mb-0 last:pb-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full group mb-2"
      >
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          {title}
        </p>
        <ChevronDown
          className={`w-3 h-3 text-gray-300 group-hover:text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && children}
    </div>
  );
}

// ── Variants table ─────────────────────────────────────────────────────────

function VariantsTable({ variants }: { variants: ProcessResponse["variants"] }) {
  return (
    <div>
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Top Process Variants</p>
        <span className="text-xs text-gray-400">({variants.length} total)</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700">
            <th className="px-4 py-2 text-left text-gray-400 font-medium w-10">#</th>
            <th className="px-4 py-2 text-left text-gray-400 font-medium">Variant</th>
            <th className="px-4 py-2 text-right text-gray-400 font-medium w-16">Cases</th>
            <th className="px-4 py-2 text-right text-gray-400 font-medium w-14">%</th>
            <th className="px-4 py-2 text-right text-gray-400 font-medium w-24">Avg Duration</th>
          </tr>
        </thead>
        <tbody>
          {variants.slice(0, 10).map((v) => (
            <tr
              key={v.variant_id}
              className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/30"
            >
              <td className="px-4 py-2 text-gray-400">{v.variant_id}</td>
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300 max-w-0 w-full">
                <div className="flex items-center gap-1 overflow-hidden">
                  {v.activities.map((a, i) => (
                    <span key={i} className="flex items-center gap-1 min-w-0">
                      {i > 0 && <span className="text-gray-300 flex-shrink-0">→</span>}
                      <span className="truncate">{a}</span>
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                {formatCount(v.count)}
              </td>
              <td className="px-4 py-2 text-right text-gray-500">
                {formatPercent(v.frequency_ratio)}
              </td>
              <td className="px-4 py-2 text-right text-gray-500">
                {formatDuration(v.avg_duration_ms)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────

function DetailPanel({
  selectedElement,
  graph,
}: {
  selectedElement: SelectedElement;
  graph: ProcessGraphType | null;
}) {
  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Details</p>
      {!selectedElement && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-700 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-gray-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Click a node or edge in the process map to inspect its metrics.
          </p>
        </div>
      )}
      {selectedElement?.type === "node" && (
        <NodeDetail node={selectedElement.data} graph={graph} />
      )}
      {selectedElement?.type === "edge" && (
        <EdgeDetail edge={selectedElement.data} graph={graph} />
      )}
    </div>
  );
}

function NodeDetail({ node, graph }: { node: GraphNode; graph: ProcessGraphType | null }) {
  const incomingEdges = graph?.edges.filter((e) => e.target === node.id && e.source !== node.id) ?? [];
  const outgoingEdges = graph?.edges.filter((e) => e.source === node.id && e.target !== node.id) ?? [];
  const selfLoop = graph?.edges.find((e) => e.source === node.id && e.target === node.id);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${
            node.is_start && node.is_end
              ? "bg-violet-400"
              : node.is_start
              ? "bg-green-400"
              : node.is_end
              ? "bg-orange-400"
              : "bg-blue-400"
          }`}
        />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
          {node.label}
        </h3>
      </div>

      <div className="space-y-2.5">
        <DetailRow label="Total events" value={formatCount(node.count)} />
        <DetailRow
          label="Avg position"
          value={`${(node.avg_position * 100).toFixed(0)}% through case`}
        />
        {node.avg_duration_before_ms != null && (
          <DetailRow label="Avg wait before" value={formatDuration(node.avg_duration_before_ms)} />
        )}
        <DetailRow
          label="Activity type"
          value={
            node.is_start && node.is_end
              ? "Start & End"
              : node.is_start
              ? "Start"
              : node.is_end
              ? "End"
              : "Intermediate"
          }
        />
        {selfLoop && (
          <DetailRow label="Self-loop" value={`${formatCount(selfLoop.count)} times`} />
        )}
      </div>

      {incomingEdges.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Incoming ({incomingEdges.length})
          </p>
          <div className="space-y-0">
            {incomingEdges.map((e) => (
              <div
                key={e.id}
                className="flex justify-between items-center py-1.5 border-t border-gray-50 dark:border-gray-700 first:border-t-0"
              >
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[130px]">
                  {e.source}
                </span>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0 ml-2">
                  {formatCount(e.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {outgoingEdges.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Outgoing ({outgoingEdges.length})
          </p>
          <div className="space-y-0">
            {outgoingEdges.map((e) => (
              <div
                key={e.id}
                className="flex justify-between items-center py-1.5 border-t border-gray-50 dark:border-gray-700 first:border-t-0"
              >
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[130px]">
                  {e.target}
                </span>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0 ml-2">
                  {formatCount(e.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EdgeDetail({ edge, graph }: { edge: GraphEdge; graph: ProcessGraphType | null }) {
  const sourceNode = graph?.nodes.find((n) => n.id === edge.source);
  const targetNode = graph?.nodes.find((n) => n.id === edge.target);
  const [copied, setCopied] = useState(false);

  const caseIds = edge.case_ids ?? [];
  const sampleIds = caseIds.slice(0, 5);

  function handleCopyAll() {
    navigator.clipboard.writeText(caseIds.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{edge.source}</h3>
        <div className="flex items-center gap-1 my-1.5">
          <div className="h-px flex-1 bg-blue-200" />
          <span className="text-blue-400 text-xs">→</span>
          <div className="h-px flex-1 bg-blue-200" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{edge.target}</h3>
      </div>

      <div className="space-y-2.5">
        <DetailRow label="Transitions" value={formatCount(edge.count)} />
        <DetailRow label="Frequency" value={formatPercent(edge.frequency_ratio)} />
        {edge.avg_duration_ms != null && (
          <DetailRow label="Avg time" value={formatDuration(edge.avg_duration_ms)} />
        )}
      </div>

      {caseIds.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Case IDs ({caseIds.length})
            </p>
            <button
              onClick={handleCopyAll}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {copied ? "Copied!" : "Copy all"}
            </button>
          </div>
          <div className="space-y-0">
            {sampleIds.map((id) => (
              <div
                key={id}
                className="py-1 border-t border-gray-50 dark:border-gray-700 first:border-t-0"
              >
                <span className="text-xs font-mono text-gray-600 dark:text-gray-300">{id}</span>
              </div>
            ))}
            {caseIds.length > 5 && (
              <p className="text-[10px] text-gray-400 pt-1">
                +{caseIds.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {sourceNode && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Source — {sourceNode.label}
          </p>
          <div className="space-y-2">
            <DetailRow label="Events" value={formatCount(sourceNode.count)} />
            <DetailRow
              label="Avg position"
              value={`${(sourceNode.avg_position * 100).toFixed(0)}%`}
            />
          </div>
        </div>
      )}

      {targetNode && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Target — {targetNode.label}
          </p>
          <div className="space-y-2">
            <DetailRow label="Events" value={formatCount(targetNode.count)} />
            <DetailRow
              label="Avg position"
              value={`${(targetNode.avg_position * 100).toFixed(0)}%`}
            />
            {targetNode.avg_duration_before_ms != null && (
              <DetailRow
                label="Avg wait before"
                value={formatDuration(targetNode.avg_duration_before_ms)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 text-right">
        {value}
      </span>
    </div>
  );
}

// ── Graph loading skeleton ─────────────────────────────────────────────────

function GraphLoadingSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-800">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
        <p className="text-xs text-gray-400">Loading graph…</p>
      </div>
    </div>
  );
}

// ── Loading / Error states ────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Building process map…
        </p>
        <p className="text-xs text-gray-400">Analysing events and computing graph</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Analysis failed</p>
          <p className="text-xs text-gray-500 mt-1">{message}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    </div>
  );
}
