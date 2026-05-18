"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape, { type ElementDefinition } from "cytoscape";
import dagre from "cytoscape-dagre";
import { ZoomIn, ZoomOut, Maximize2, Download } from "lucide-react";
import { formatDuration, formatPercent, formatCount, cn } from "@/lib/utils";
import type { ProcessGraph as ProcessGraphData, SelectedElement } from "@/lib/types";

// Register dagre once (safe to call repeatedly — cytoscape guards against double-registration)
try {
  cytoscape.use(dagre);
} catch {
  // Already registered on HMR reload
}

// ── Stylesheet (dark-mode aware) ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStylesheet(isDark: boolean, showSynthetic: boolean): any[] {
  const nodeBg        = isDark ? "#1E293B" : "#FFFFFF";
  const nodeBorder    = isDark ? "#3B82F6" : "#60A5FA";
  const nodeText      = isDark ? "#E2E8F0" : "#1F2937";
  const edgeLine      = isDark ? "#475569" : "#CBD5E1";
  const edgeText      = isDark ? "#94A3B8" : "#64748B";
  const edgeTextBg    = isDark ? "#1E293B" : "#F8FAFC";
  const edgeBgOpacity = isDark ? 1 : 0.9;

  return [
    {
      selector: "node",
      style: {
        "background-color": nodeBg,
        "border-width": 2,
        "border-color": nodeBorder,
        shape: "round-rectangle",
        width: "data(nodeWidth)",
        height: 86,
        padding: "13px",
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": "data(textMaxWidth)",
        "font-size": "18px",
        "font-weight": "500",
        "font-family": "Inter, -apple-system, sans-serif",
        color: nodeText,
        "line-height": 1.5,
      },
    },
    {
      selector: "node.start-node",
      style: {
        "background-color": isDark ? "#052E16" : "#F0FDF4",
        "border-color": "#22C55E",
        "border-width": 2.5,
      },
    },
    {
      selector: "node.end-node",
      style: {
        "background-color": isDark ? "#431407" : "#FFF7ED",
        "border-color": "#F97316",
        "border-width": 2.5,
      },
    },
    {
      selector: "node.start-end-node",
      style: {
        "background-color": isDark ? "#2E1065" : "#F5F3FF",
        "border-color": "#8B5CF6",
        "border-width": 2.5,
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-color": isDark ? "#60A5FA" : "#1D4ED8",
        "border-width": 3,
        "background-color": isDark ? "#1E3A5F" : "#EFF6FF",
      },
    },
    // ── Edges ──────────────────────────────────────────────────────────────
    {
      selector: "edge",
      style: {
        "line-color": edgeLine,
        "target-arrow-color": edgeLine,
        "target-arrow-shape": "triangle",
        "curve-style": "unbundled-bezier",
        "control-point-distances": "data(controlPointDistance)",
        "control-point-weights": 0.5,
        width: "data(lineWidth)",
        label: "data(label)",
        "font-size": "16px",
        "text-rotation": "autorotate",
        color: edgeText,
        "text-background-color": edgeTextBg,
        "text-background-opacity": edgeBgOpacity,
        "text-background-padding": "2px",
      },
    },
    {
      selector: "edge:selected",
      style: {
        "line-color": isDark ? "#60A5FA" : "#3B82F6",
        "target-arrow-color": isDark ? "#60A5FA" : "#3B82F6",
        color: isDark ? "#93C5FD" : "#1D4ED8",
      },
    },
    // Self-loop edges (red)
    {
      selector: "edge.loop-edge",
      style: {
        "line-color": isDark ? "#DC2626" : "#EF4444",
        "target-arrow-color": isDark ? "#DC2626" : "#EF4444",
        "curve-style": "loop",
        color: isDark ? "#FCA5A5" : "#991B1B",
        "text-background-color": isDark ? "#1E293B" : "#FEF2F2",
        "text-background-opacity": edgeBgOpacity,
      },
    },
    // Synthetic edges — dashed and muted (curvature inherited from base edge rule)
    {
      selector: "edge.synthetic-edge",
      style: {
        "line-style": "dashed",
        "line-dash-pattern": [6, 4],
        "line-color": isDark ? "#334155" : "#cbd5e1",
        "target-arrow-color": isDark ? "#334155" : "#cbd5e1",
        color: isDark ? "#475569" : "#94a3b8",
        "text-background-color": isDark ? "#0f172a" : "#f8fafc",
      },
    },
    // Synthetic start/end nodes — dashed border, muted italic text
    {
      selector: "node.synthetic-node",
      style: {
        "background-color": isDark ? "#0f172a" : "#f8fafc",
        "border-style": "dashed",
        "border-color": isDark ? "#475569" : "#94a3b8",
        "border-width": 1.5,
        color: isDark ? "#64748b" : "#94a3b8",
        "font-style": "italic",
      },
    },
    {
      selector: "edge.loop-edge:selected",
      style: {
        "line-color": isDark ? "#60A5FA" : "#3B82F6",
        "target-arrow-color": isDark ? "#60A5FA" : "#3B82F6",
        color: isDark ? "#93C5FD" : "#1D4ED8",
      },
    },
    // Hide synthetic nodes/edges without remounting (display:none keeps positions stable)
    ...(!showSynthetic
      ? [{ selector: "node.synthetic-node, edge.synthetic-edge", style: { display: "none" } }]
      : []),
  ];
}

// ── Layout config ──────────────────────────────────────────────────────────

const LAYOUT = {
  name: "preset",
  fit: true,
  padding: 50,
  animate: false,
};

// ── Layout constants ───────────────────────────────────────────────────────
// Activities sit on a horizontal row (y = 0), ordered by avg_position.
// Synthetic Start is placed below-left; Synthetic End is above-right.
const ACT_STEP = 400;   // horizontal spacing between activity centres
const DIAG_X   = 260;   // horizontal offset of Start/End from the nearest activity
const DIAG_Y   = 260;   // vertical offset (y-down: Start is +y below, End is −y above)

// ── Element builders ───────────────────────────────────────────────────────

const SYNTHETIC_PREFIX = "[Synthetic]";

function buildElements(
  graph: ProcessGraphData,
  loopEdgeIds: Set<string>,
  activityOrder: string[]
): ElementDefinition[] {
  // ── Node positions (preset layout) ────────────────────────────────────────
  // Regular nodes are ordered by the user-defined activityOrder when provided,
  // falling back to avg_position for any nodes not in that list.
  const regularNodes = [...graph.nodes]
    .filter((n) => !n.id.startsWith(SYNTHETIC_PREFIX))
    .sort((a, b) => {
      const ai = activityOrder.indexOf(a.id);
      const bi = activityOrder.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.avg_position - b.avg_position;
    });

  const nodePositions: Record<string, { x: number; y: number }> = {};

  // Activities: flat horizontal row at y = 0, ordered by avg_position
  regularNodes.forEach((node, i) => {
    nodePositions[node.id] = { x: ACT_STEP * i, y: 0 };
  });

  const lastIdx = Math.max(regularNodes.length - 1, 0);
  // Synthetic Start: below-left of the first activity
  nodePositions[`${SYNTHETIC_PREFIX} Start`] = { x: -DIAG_X, y: DIAG_Y };
  // Synthetic End: above-right of the last activity
  nodePositions[`${SYNTHETIC_PREFIX} End`]   = { x: lastIdx * ACT_STEP + DIAG_X, y: -DIAG_Y };

  // ── Forward-adjacent pairs — straight edges only from activity[i] → activity[i+1]
  const forwardAdjacentPairs = new Set<string>();
  for (let i = 0; i < regularNodes.length - 1; i++) {
    forwardAdjacentPairs.add(`${regularNodes[i].id}|||${regularNodes[i + 1].id}`);
  }

  // ── Edge frequency scale (exclude synthetic edges) ────────────────────────
  // An edge is synthetic if either its source or target is a synthetic node.
  const isSyntheticEdgeFn = (edge: ProcessGraphData["edges"][number]) =>
    edge.source.startsWith(SYNTHETIC_PREFIX) || edge.target.startsWith(SYNTHETIC_PREFIX);

  const regularEdges = graph.edges.filter((e) => !isSyntheticEdgeFn(e));
  const maxEdgeCount = Math.max(...regularEdges.map((e) => e.count), 1);

  // ── Effective node count: max(inflow, outflow) ────────────────────────────
  const inflow: Record<string, number> = {};
  const outflow: Record<string, number> = {};
  for (const edge of graph.edges) {
    inflow[edge.target]  = (inflow[edge.target]  ?? 0) + edge.count;
    outflow[edge.source] = (outflow[edge.source] ?? 0) + edge.count;
  }

  const nodes: ElementDefinition[] = graph.nodes.map((node) => {
    const effectiveCount = Math.max(inflow[node.id] ?? 0, outflow[node.id] ?? 0);
    const nodeWidth = Math.max(140, Math.min(280, node.label.length * 13 + 50));
    const isSynthetic = node.id.startsWith(SYNTHETIC_PREFIX);
    const cls = isSynthetic
      ? "synthetic-node"
      : node.is_start && node.is_end
      ? "start-end-node"
      : node.is_start
      ? "start-node"
      : node.is_end
      ? "end-node"
      : "";

    return {
      data: {
        id: node.id,
        label: `${node.label}\n${formatCount(effectiveCount)}`,
        count: effectiveCount,
        avg_duration_before_ms: node.avg_duration_before_ms,
        avg_position: node.avg_position,
        is_start: node.is_start,
        is_end: node.is_end,
        nodeWidth,
        textMaxWidth: `${nodeWidth - 20}px`,
      },
      classes: cls,
      position: nodePositions[node.id] ?? { x: 0, y: 0 },
    };
  });

  const edges: ElementDefinition[] = graph.edges.map((edge) => {
    const isSyntheticEdge = isSyntheticEdgeFn(edge);
    const relFreq = isSyntheticEdge ? 0 : edge.count / maxEdgeCount;
    const lineWidth = 2.5 + relFreq * 11.5;
    const classes = [
      isSyntheticEdge && "synthetic-edge",
      loopEdgeIds.has(edge.id) && "loop-edge",
    ]
      .filter(Boolean)
      .join(" ");

    // Distance-proportional curvature applied to every edge.
    // Positive = arc bows left of the source→target direction (upward for left-to-right edges).
    // Edges going TO [Synthetic] End are negated so they fan in the opposite direction,
    // creating a mirrored spread that visually balances the Start fan.
    const src = nodePositions[edge.source] ?? { x: 0, y: 0 };
    const tgt = nodePositions[edge.target] ?? { x: 0, y: 0 };
    const edgeDist = Math.hypot(tgt.x - src.x, tgt.y - src.y);
    const isEndEdge = edge.target === `${SYNTHETIC_PREFIX} End`;
    const isForwardAdjacent = forwardAdjacentPairs.has(`${edge.source}|||${edge.target}`);
    const controlPointDistance = isForwardAdjacent
      ? 0
      : Math.round(edgeDist * 0.3 * (isEndEdge ? -1 : 1));

    return {
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: formatCount(edge.count),
        count: edge.count,
        avg_duration_ms: edge.avg_duration_ms,
        frequency_ratio: edge.frequency_ratio,
        lineWidth,
        controlPointDistance,
      },
      classes,
    };
  });

  return [...nodes, ...edges];
}

// ── Component ──────────────────────────────────────────────────────────────

interface ProcessGraphProps {
  graph: ProcessGraphData;
  selectedElement: SelectedElement;
  onSelectElement: (el: SelectedElement) => void;
  loopEdgeIds?: Set<string>;
  activityOrder?: string[];
  showSynthetic?: boolean;
  resetLayoutKey?: number;
  isDark?: boolean;
}

interface TooltipState {
  x: number;
  y: number;
  type: "node" | "edge";
  data: Record<string, unknown>;
}

export function ProcessGraph({
  graph,
  selectedElement,
  onSelectElement,
  loopEdgeIds = new Set(),
  activityOrder = [],
  showSynthetic = true,
  resetLayoutKey = 0,
  isDark = false,
}: ProcessGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cyInstance, setCyInstance] = useState<cytoscape.Core | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Edge curvature drag state (refs — no re-renders during drag)
  const edgeCurvaturesRef = useRef<Record<string, number>>({});
  const dragRef = useRef<{
    edgeId: string;
    startX: number;
    startY: number;
    startCurvature: number;
    perpX: number;
    perpY: number;
  } | null>(null);
  // Keep a ref to loopEdgeIds so event handlers don't go stale
  const loopEdgeIdsRef = useRef(loopEdgeIds);
  useEffect(() => { loopEdgeIdsRef.current = loopEdgeIds; }, [loopEdgeIds]);

  // Always-current ref to the live Cytoscape instance — used by the reset effect
  // to avoid racing with instance teardown when graphKey changes simultaneously.
  const cyRef = useRef<cytoscape.Core | null>(null);
  useEffect(() => { cyRef.current = cyInstance; }, [cyInstance]);

  // Default node positions computed by buildElements — kept in a ref so the
  // reset effect can read them without being in their dependency array.
  const defaultPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // Reset node positions and edge curvatures when the parent increments resetLayoutKey.
  // Depends only on resetLayoutKey so it never races with Cytoscape remounts triggered
  // by activityOrder / topology changes.
  useEffect(() => {
    if (!resetLayoutKey) return; // skip initial value of 0
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const pos = defaultPositionsRef.current[node.id()];
        if (pos) node.position({ x: pos.x, y: pos.y });
      });
      // Remove all inline curvature overrides — stylesheet data(controlPointDistance)
      // takes over and restores the originally-computed default curvature per edge.
      cy.edges().removeStyle("curve-style control-point-distances");
    });
    edgeCurvaturesRef.current = {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetLayoutKey]);

  // Stable lookup maps
  const nodeMap = useMemo(
    () => Object.fromEntries(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes]
  );
  const edgeMap = useMemo(
    () => Object.fromEntries(graph.edges.map((e) => [e.id, e])),
    [graph.edges]
  );

  // Remount Cytoscape when topology or activity order changes
  const graphKey = useMemo(
    () => graph.nodes.map((n) => n.id).sort().join("|") + "|" + activityOrder.join(","),
    [graph.nodes, activityOrder]
  );

  const elements = useMemo(
    () => buildElements(graph, loopEdgeIds, activityOrder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, loopEdgeIds, activityOrder]
  );

  // Capture default positions every time elements are recomputed so that
  // the reset effect always restores the correct computed-default positions.
  useEffect(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const el of elements) {
      if (el.position && el.data && !el.data.source) {
        positions[el.data.id as string] = { x: el.position.x, y: el.position.y };
      }
    }
    defaultPositionsRef.current = positions;
  }, [elements]);

  // Re-build stylesheet when dark mode toggles
  const stylesheet = useMemo(() => buildStylesheet(isDark, showSynthetic), [isDark, showSynthetic]);

  // ── Event handlers ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!cyInstance) return;

    const domContainer = cyInstance.container();

    const getRenderedPos = (evt: cytoscape.EventObject) => {
      if (!domContainer) return { x: 0, y: 0 };
      const rect = domContainer.getBoundingClientRect();
      const pos = evt.renderedPosition;
      return { x: rect.left + pos.x + 14, y: rect.top + pos.y - 14 };
    };

    const onNodeTap = (evt: cytoscape.EventObject) => {
      const node = evt.target as cytoscape.NodeSingular;
      const id = node.id();
      const data = nodeMap[id];
      if (data) onSelectElement({ type: "node", id, data });
    };

    const onEdgeTap = (evt: cytoscape.EventObject) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      const id = edge.id();
      const data = edgeMap[id];
      if (data) onSelectElement({ type: "edge", id, data });
    };

    const onBgTap = (evt: cytoscape.EventObject) => {
      if (evt.target === cyInstance) onSelectElement(null);
    };

    const onNodeOver = (evt: cytoscape.EventObject) => {
      const { x, y } = getRenderedPos(evt);
      const d = (evt.target as cytoscape.NodeSingular).data();
      setTooltip({ x, y, type: "node", data: d });
    };

    const onEdgeOver = (evt: cytoscape.EventObject) => {
      const { x, y } = getRenderedPos(evt);
      const d = (evt.target as cytoscape.EdgeSingular).data();
      setTooltip({ x, y, type: "edge", data: d });
      // Show grab cursor for draggable (non-loop, non-synthetic) edges
      const edgeEl = evt.target as cytoscape.EdgeSingular;
      if (domContainer && !dragRef.current && !loopEdgeIdsRef.current.has(d.id as string) && !edgeEl.hasClass("synthetic-edge")) {
        domContainer.style.cursor = "grab";
      }
    };

    const onOut = () => {
      setTooltip(null);
      if (domContainer && !dragRef.current) domContainer.style.cursor = "";
    };

    // ── Edge curvature drag ────────────────────────────────────────────────
    const onEdgeMousedown = (evt: cytoscape.EventObject) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      const edgeId = edge.id();
      if (loopEdgeIdsRef.current.has(edgeId)) return;
      if (edge.hasClass("synthetic-edge")) return;

      const src = edge.source().renderedPosition();
      const tgt = edge.target().renderedPosition();
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;

      const rp = evt.renderedPosition;
      dragRef.current = {
        edgeId,
        startX: rp.x,
        startY: rp.y,
        startCurvature: edgeCurvaturesRef.current[edgeId] ?? 0,
        // Left perpendicular of the edge direction (CCW in model coords)
        perpX: -dy / len,
        perpY: dx / len,
      };
      cyInstance.userPanningEnabled(false);
      if (domContainer) domContainer.style.cursor = "grabbing";
    };

    // Double-click resets curvature to default bezier routing
    const onEdgeDblclick = (evt: cytoscape.EventObject) => {
      const edge = evt.target as cytoscape.EdgeSingular;
      const edgeId = edge.id();
      if (loopEdgeIdsRef.current.has(edgeId)) return;
      if (edge.hasClass("synthetic-edge")) return;
      delete edgeCurvaturesRef.current[edgeId];
      edge.removeStyle("curve-style control-point-distances");
    };

    cyInstance.on("tap", "node", onNodeTap);
    cyInstance.on("tap", "edge", onEdgeTap);
    cyInstance.on("tap", onBgTap);
    cyInstance.on("mouseover", "node", onNodeOver);
    cyInstance.on("mouseover", "edge", onEdgeOver);
    cyInstance.on("mouseout", "node, edge", onOut);
    cyInstance.on("drag", onOut);
    cyInstance.on("zoom pan", onOut);
    cyInstance.on("mousedown", "edge", onEdgeMousedown);
    cyInstance.on("dblclick", "edge", onEdgeDblclick);

    return () => {
      cyInstance.removeAllListeners();
    };
  }, [cyInstance, nodeMap, edgeMap, onSelectElement]);

  // ── Document-level mouse events for edge drag ────────────────────────────
  useEffect(() => {
    if (!cyInstance) return;

    const onMousemove = (evt: MouseEvent) => {
      if (!dragRef.current) return;
      const { edgeId, startX, startY, startCurvature, perpX, perpY } = dragRef.current;

      const container = cyInstance.container();
      if (!container) return;
      const rect = container.getBoundingClientRect();

      const mouseX = evt.clientX - rect.left;
      const mouseY = evt.clientY - rect.top;
      const deltaX = mouseX - startX;
      const deltaY = mouseY - startY;

      // Project mouse delta onto the edge perpendicular, then convert to model coords
      const renderedDelta = deltaX * perpX + deltaY * perpY;
      const modelDelta = renderedDelta / cyInstance.zoom();
      const newCurvature = startCurvature + modelDelta;

      edgeCurvaturesRef.current[edgeId] = newCurvature;

      const edge = cyInstance.getElementById(edgeId);
      if (edge.length > 0) {
        edge.style({
          "curve-style": "unbundled-bezier",
          "control-point-distances": [newCurvature],
        });
      }
    };

    const onMouseup = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      cyInstance.userPanningEnabled(true);
      const container = cyInstance.container();
      if (container) container.style.cursor = "";
    };

    document.addEventListener("mousemove", onMousemove);
    document.addEventListener("mouseup", onMouseup);
    return () => {
      document.removeEventListener("mousemove", onMousemove);
      document.removeEventListener("mouseup", onMouseup);
    };
  }, [cyInstance]);

// Sync external selectedElement to Cytoscape selection
  useEffect(() => {
    if (!cyInstance) return;
    cyInstance.elements().unselect();
    if (selectedElement) {
      cyInstance.getElementById(selectedElement.id).select();
    }
  }, [cyInstance, selectedElement]);

  // ── Controls ─────────────────────────────────────────────────────────────
  const zoomIn  = () => { if (cyInstance) cyInstance.zoom(cyInstance.zoom() * 1.25); };
  const zoomOut = () => { if (cyInstance) cyInstance.zoom(cyInstance.zoom() * 0.8); };
  const fitScreen = () => cyInstance?.fit(undefined, 50);

  const exportPng = () => {
    if (!cyInstance) return;
    const uri = cyInstance.png({ output: "base64uri", full: true, scale: 2 });
    const a = document.createElement("a");
    a.href = uri;
    a.download = "process-map.png";
    a.click();
  };

  const hasLoops = loopEdgeIds.size > 0;

  // Shared dark-aware class helpers for overlay panels
  const panelCls = isDark
    ? "bg-slate-800/95 border-slate-700 backdrop-blur-sm"
    : "bg-white/90 border-gray-100 backdrop-blur-sm";
  const labelCls  = isDark ? "text-gray-300" : "text-gray-500";
  const labelHdCls = isDark ? "text-gray-400" : "text-gray-400";
  const strongCls = isDark ? "text-gray-100" : "text-gray-800";

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full", isDark ? "bg-slate-900" : "bg-slate-50")}
    >
      {/* Cytoscape canvas */}
      <CytoscapeComponent
        key={graphKey}
        cy={setCyInstance}
        elements={elements}
        stylesheet={stylesheet}
        layout={LAYOUT}
        style={{ width: "100%", height: "100%" }}
        userZoomingEnabled
        userPanningEnabled
        boxSelectionEnabled={false}
        autoungrabify={false}
      />

      {/* Legend */}
      <div
        className={cn(
          "absolute bottom-4 left-4 flex flex-col gap-1.5 border rounded-xl px-3 py-2.5 shadow-sm",
          panelCls
        )}
      >
        <p className={cn("text-[10px] font-semibold uppercase tracking-wider mb-0.5", labelHdCls)}>
          Legend
        </p>
        <LegendNode
          color={isDark ? "border-green-400 bg-green-950" : "border-green-400 bg-green-50"}
          label="Start activity"
          labelCls={labelCls}
        />
        <LegendNode
          color={isDark ? "border-orange-400 bg-orange-950" : "border-orange-400 bg-orange-50"}
          label="End activity"
          labelCls={labelCls}
        />
        <LegendNode
          color={isDark ? "border-blue-400 bg-slate-700" : "border-blue-400 bg-white"}
          label="Intermediate"
          labelCls={labelCls}
        />
        <LegendNode
          color={isDark ? "border-violet-400 bg-violet-950" : "border-violet-400 bg-violet-50"}
          label="Start + End"
          labelCls={labelCls}
        />
        <div className={cn("h-px my-0.5", isDark ? "bg-slate-700" : "bg-gray-100")} />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <div className={cn("h-0.5 w-3 rounded", isDark ? "bg-slate-500" : "bg-gray-300")} />
            <div className={cn("h-1 w-4 rounded",   isDark ? "bg-slate-400" : "bg-gray-400")} />
            <div className={cn("h-1.5 w-5 rounded", isDark ? "bg-slate-300" : "bg-gray-500")} />
          </div>
          <span className={cn("text-[10px]", labelCls)}>Edge frequency</span>
        </div>
        {hasLoops && (
          <div className="flex items-center gap-2">
            <div className={cn("h-1.5 w-10 rounded flex-shrink-0", isDark ? "bg-red-600" : "bg-red-400")} />
            <span className={cn("text-[10px]", labelCls)}>Self-loop</span>
          </div>
        )}
      </div>

      {/* Graph controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-1.5">
        <ControlButton onClick={zoomIn}    title="Zoom in"       isDark={isDark}><ZoomIn    className="w-4 h-4" /></ControlButton>
        <ControlButton onClick={fitScreen} title="Fit to screen" isDark={isDark}><Maximize2 className="w-4 h-4" /></ControlButton>
        <ControlButton onClick={zoomOut}   title="Zoom out"      isDark={isDark}><ZoomOut   className="w-4 h-4" /></ControlButton>
        <div className={cn("h-px mx-1 my-0.5", isDark ? "bg-slate-700" : "bg-gray-200")} />
        <ControlButton onClick={exportPng} title="Export PNG"    isDark={isDark}><Download  className="w-4 h-4" /></ControlButton>
      </div>

      {/* Graph stats badge */}
      <div
        className={cn(
          "absolute top-4 left-4 flex items-center gap-2 border rounded-full px-3 py-1.5 shadow-sm",
          panelCls
        )}
      >
        <span className={cn("text-xs", labelCls)}>
          <strong className={strongCls}>{graph.nodes.length}</strong> activities
        </span>
        <span className={isDark ? "text-slate-600" : "text-gray-200"}>·</span>
        <span className={cn("text-xs", labelCls)}>
          <strong className={strongCls}>{graph.edges.length}</strong> transitions
        </span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div
            className={cn(
              "border rounded-xl shadow-lg p-3 text-xs min-w-[180px] max-w-xs",
              isDark
                ? "bg-slate-800 border-slate-700"
                : "bg-white border-gray-100"
            )}
          >
            {tooltip.type === "node" ? (
              <NodeTooltip data={tooltip.data} isDark={isDark} />
            ) : (
              <EdgeTooltip data={tooltip.data} isDark={isDark} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tooltip content ────────────────────────────────────────────────────────

function NodeTooltip({ data, isDark }: { data: Record<string, unknown>; isDark: boolean }) {
  return (
    <div className="space-y-2">
      <p className={cn("font-semibold text-sm", isDark ? "text-gray-100" : "text-gray-900")}>
        {String(data.id)}
      </p>
      <div className="space-y-1">
        <TooltipRow label="Events"       value={formatCount(Number(data.count))}                                              isDark={isDark} />
        <TooltipRow label="Avg position" value={`${((data.avg_position as number) * 100).toFixed(0)}%`}                      isDark={isDark} />
        {data.avg_duration_before_ms != null && (
          <TooltipRow label="Avg wait before" value={formatDuration(Number(data.avg_duration_before_ms))}                    isDark={isDark} />
        )}
      </div>
      <div className="flex flex-wrap gap-1 pt-1">
        {Boolean(data.is_start) && (
          <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-medium border border-green-100">
            Start
          </span>
        )}
        {Boolean(data.is_end) && (
          <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-[10px] font-medium border border-orange-100">
            End
          </span>
        )}
      </div>
    </div>
  );
}

function EdgeTooltip({ data, isDark }: { data: Record<string, unknown>; isDark: boolean }) {
  return (
    <div className="space-y-2">
      <p className={cn("font-semibold text-sm", isDark ? "text-gray-100" : "text-gray-900")}>
        {String(data.source)}{" "}
        <span className={isDark ? "text-slate-500 font-normal" : "text-gray-400 font-normal"}>→</span>{" "}
        {String(data.target)}
      </p>
      <div className="space-y-1">
        <TooltipRow label="Transitions" value={formatCount(Number(data.count))}                         isDark={isDark} />
        <TooltipRow label="Frequency"   value={formatPercent(Number(data.frequency_ratio))}              isDark={isDark} />
        {data.avg_duration_ms != null && (
          <TooltipRow label="Avg time"  value={formatDuration(Number(data.avg_duration_ms))}             isDark={isDark} />
        )}
      </div>
    </div>
  );
}

function TooltipRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={isDark ? "text-slate-400" : "text-gray-400"}>{label}</span>
      <span className={cn("font-medium", isDark ? "text-gray-200" : "text-gray-800")}>{value}</span>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────

function ControlButton({
  onClick,
  title,
  isDark,
  children,
}: {
  onClick: () => void;
  title: string;
  isDark: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "w-8 h-8 rounded-lg border shadow-sm",
        "flex items-center justify-center",
        "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        isDark
          ? "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200 hover:border-slate-600"
          : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300"
      )}
    >
      {children}
    </button>
  );
}

function LegendNode({ color, label, labelCls }: { color: string; label: string; labelCls: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-3.5 h-3.5 rounded border-2 flex-shrink-0", color)} />
      <span className={cn("text-[10px]", labelCls)}>{label}</span>
    </div>
  );
}
