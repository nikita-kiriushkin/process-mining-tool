# Process Mining Tool — Project Context

## What this is

A full-stack interactive process mining web app. Users upload a CSV event log, map columns, and explore an interactive process map (Directed-Follows Graph) with filters, metrics, and variant analysis.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Cytoscape.js (dagre layout) + Zustand + TanStack Query
- **Backend**: FastAPI + pandas (custom DFG logic, no pm4py) + Pydantic v2
- **No database** — CSV files held as temp files per session (in-memory for MVP)
- **Docker Compose** for local dev

## Key architectural decisions

- **No pm4py** — DFG construction is implemented with pandas. Keeps the image small and logic transparent.
- **Cytoscape.js over React Flow** — Process graphs have cycles/loops. Cytoscape + dagre handles these natively.
- **Server-side filtering** — All filters (date range, activity, variant, dimension) are sent to `POST /api/process` which re-runs the full mining pipeline. TanStack Query re-fetches when filter state changes.
- **Dynamic import** for ProcessGraph (`ssr: false`) — Cytoscape.js requires browser APIs.
- **Session model** — Upload returns a `session_id` that maps to a temp CSV file. State lives in Zustand stores (no persistence across page refresh — acceptable for MVP).
- **`min_edge_frequency` is post-graph** — applied in the `/process` route after `build_process_graph()` returns, not inside the DFG miner or `apply_filters()`. This is because the filter operates on graph edges, not on the event log rows.
- **Cytoscape dark mode via dynamic stylesheet** — Tailwind `dark:` classes don't reach inside the Cytoscape canvas. Dark mode is implemented by passing `isDark: boolean` into `ProcessGraph` and rebuilding the stylesheet via `buildStylesheet(isDark)`.

---

## Implementation — all steps complete

### Step 1 — Scaffolding ✅
All config, Docker Compose, README, .gitignore, sample data.

### Step 2 — Backend CSV parser ✅
`backend/core/parser.py` — `parse_csv_preview`, `parse_event_log` with validation, timestamp coercion, sorting.

### Step 3 — Backend process miner ✅
- `backend/core/miner.py` — DFG construction: node counts, edge counts, avg durations, start/end flags, avg position, incoming wait time
- `backend/core/variants.py` — variant extraction ranked by frequency with duration
- `backend/core/filters.py` — date range, activity include/exclude, dimension, variant filters (all case-level except activity which is event-level)

### Step 4 — Backend API ✅
- `POST /api/upload` — returns `session_id` + columns + sample rows
- `POST /api/process` — applies filters → mines → returns `ProcessResponse`
- Pydantic schemas in `backend/api/schemas/process.py`
- **17 backend tests passing** (test_parser, test_miner, test_variants)

### Step 5 — Upload + column mapping UI ✅
- `FileDropzone` — drag-drop with idle/uploading/success/error states
- `ColumnMapper` — auto-detects columns from common aliases, data preview table with blue highlight on mapped columns, duplicate-column prevention
- `StepIndicator` — 3-step wizard progress bar
- `/upload` page → `/map` page with guards (redirect to /upload if no session)
- Zustand stores: `uploadStore` (sessionId, uploadResponse, columnMapping), `exploreStore` (processData, filters, selectedElement)

### Step 6 — Cytoscape.js process graph ✅
- `frontend/src/components/graph/ProcessGraph.tsx`
  - dagre LR layout
  - Nodes: round-rectangle, coloured by type (green=start, orange=end, violet=start+end, blue=default)
  - Edge thickness: 1.5–8.5px scaled by `count/maxEdgeCount`
  - Node tooltips: events, avg position, avg wait, type badges
  - Edge tooltips: transitions, frequency %, avg time
  - Click → syncs to `selectedElement` in store
  - Controls: zoom in/out, fit screen, export PNG
  - Legend overlay (bottom-left)
  - Stats badge (nodes/edges count, top-left)
- `/explore` page: 3-panel layout (filter panel | graph | detail panel) + variants table at bottom
- Detail panel shows real node/edge metrics on click
- `ProcessGraph` loaded with `ssr: false` (dynamic import)

### Step 7 — Interactive filter panel ✅
`FilterPanel` component in `explore/page.tsx` (replaces `FilterPlaceholder`):
- **Date range** — two `<input type="date">` with data-range hint; fires `setFilters` immediately on change
- **Activities** — scrollable checkbox list (uncheck = exclude); shows "N excluded" badge; maps to `exclude_activities`
- **Min edge frequency** — `<input type="range">` slider; local state updates display in real-time; commits to store only on `mouseUp`/`touchEnd` to avoid rapid re-fetches; maps to `min_edge_frequency`
- **Variants** — checkbox list of top 10 variants with case counts; maps to `variant_ids`
- **Dimension filters** — one checkbox group per available dimension (only rendered if that column exists in the data); maps to `dimension_filters`
- **Reset** button — disabled when no filters are active; clears both local React state and Zustand store

### Step 8 — Expanded detail panel ✅
- `NodeDetail` cross-references `data.graph.edges` to show **Incoming** and **Outgoing** edge lists (neighbour name + count). Self-loop count shown if present.
- `EdgeDetail` shows **Source** and **Target** activity blocks with events, avg position, and avg wait before.
- Both components receive `graph: ProcessGraphType | null` prop for cross-referencing.

### Step 9 — Graph highlights + dark mode ✅
- **Happy path** — `happyPathEdgeIds` computed in `ExplorePage` from `data.variants[0]` (most-frequent variant's consecutive activity pairs). Passed to `ProcessGraph`, adds `happy-path` CSS class → amber edges.
- **Self-loops** — `loopEdgeIds` computed from edges where `source === target`. Adds `loop-edge` CSS class → red edges with `curve-style: loop`.
- **Dark mode toggle** — Moon/Sun button in header; `useState(false)` + `useEffect` toggles `dark` class on `<html>`. Tailwind `dark:` variants handle all sidebar/header elements. `isDark` prop passed to `ProcessGraph`.
- **`ProcessGraph` dark mode** — Cytoscape's canvas is not affected by CSS/Tailwind. Solved with `buildStylesheet(isDark: boolean)` which returns a full colour-swapped stylesheet. `useMemo(() => buildStylesheet(isDark), [isDark])` passes the stylesheet to `<CytoscapeComponent stylesheet={stylesheet}>`. All overlay elements (legend, controls, tooltips, stats badge) also switch colours via `isDark` prop rather than Tailwind `dark:`.
- Legend shows amber/red swatches only when those edge types are present.

### Step 10 — Second sample CSV ✅
`sample-data/it-support.csv` (also in `frontend/public/sample-data/`):
- 20 IT support tickets, Feb–Mar 2024
- Columns: `case_id`, `activity_name`, `timestamp`, `resource`, `team`, `priority`, `status`
- Activities: Ticket Created → Assigned → Under Investigation → (Escalated to L2 → Escalated to L3 →) Resolved → Closed
- Demonstrates L1/L2/L3 escalation paths, `team` and `priority` dimension filters

---

## Bug fixes (post Step 10)

### `min_edge_frequency` was silently ignored ✅
**Symptom:** moving the slider triggered a re-fetch but edges never disappeared.  
**Root cause:** `filters.py` comment said "applied in miner.py" but `miner.py` never implemented it. The Pydantic schema accepted the value and discarded it.  
**Fix:** `backend/api/routes/process.py` — after `build_process_graph()`, filter edges:
```python
min_freq = request.filters.min_edge_frequency
if min_freq and min_freq > 1:
    graph = ProcessGraph(
        nodes=graph.nodes,
        edges=[e for e in graph.edges if e.count >= min_freq],
    )
```

### Dark mode didn't apply to the graph canvas ✅
**Symptom:** toggling dark mode switched the sidebars but the Cytoscape graph stayed white.  
**Root cause:** Cytoscape renders to a `<canvas>` element — Tailwind `dark:` classes on surrounding `div`s don't affect canvas-rendered colours.  
**Fix:** `ProcessGraph.tsx` — `STYLESHEET` constant replaced with `buildStylesheet(isDark: boolean)` returning colour-swapped values. `isDark` prop added to `ProcessGraphProps`; explore page passes `isDark={darkMode}`. Stylesheet recomputed via `useMemo` on toggle.

---

## Key file locations

```
backend/
  main.py                          FastAPI entry point
  api/routes/upload.py             POST /api/upload
  api/routes/process.py            POST /api/process + min_edge_frequency post-filter
  api/schemas/process.py           Pydantic schemas (ColumnMapping, ProcessRequest, ProcessResponse, …)
                                   GraphNode gains start_count + end_count
  core/parser.py                   CSV parsing + validation
  core/miner.py                    DFG construction + metrics (start_count, end_count per node)
  core/variants.py                 Variant extraction
  core/filters.py                  Filter application (case_id, date, activity, dimension, variant)
  tests/                           17 passing tests

frontend/src/
  app/upload/page.tsx              Upload wizard page
  app/map/page.tsx                 Column mapping page
  app/explore/page.tsx             Explorer: FilterPanel, graph, DetailPanel, VariantsTable
                                   graphWithSynthetic useMemo (synthetic Start/End nodes + edges)
                                   NodeFlowChart (SVG donut), NodeDetail incoming/outgoing charts
  components/graph/ProcessGraph.tsx  Cytoscape graph — edge curvature drag, dynamic stylesheet, happy path,
                                   loop edges, dark mode, synthetic-node/synthetic-edge styles,
                                   effectiveCount = max(inflow, outflow)
  components/upload/FileDropzone.tsx Drag-drop upload
  components/upload/ColumnMapper.tsx Column mapping — positional defaults (col[0]=case_id, col[1]=activity, col[2]=timestamp)
  components/upload/StepIndicator.tsx Wizard step progress
  components/ui/Button.tsx         Reusable button
  lib/types.ts                     Shared TypeScript types (API contract)
  lib/api.ts                       Typed fetch wrappers
  lib/utils.ts                     formatDuration, formatCount, formatPercent, cn
  store/uploadStore.ts             sessionId, uploadResponse, columnMapping
  store/exploreStore.ts            processData, filters, selectedElement

sample-data/lead-funnel.csv        20-case lead funnel demo (also in frontend/public/sample-data/)
sample-data/it-support.csv         20-ticket IT support demo (also in frontend/public/sample-data/)
```

---

## How to run locally

```bash
# Backend (from repo root)
cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000

# Frontend (from repo root)
cd frontend && npm run dev

# Tests
cd backend && pytest tests/ -v
```

Frontend: http://localhost:3000  
Backend API docs: http://localhost:8000/docs

---

### Step 11 — Edge case IDs + copy ✅ (branch BIBKPLY-2168)
- `GraphEdge` schema (`backend/api/schemas/process.py`) gains `case_ids: list[str] = []`
- `miner.py` — after grouping edge pairs, collects unique `case_id` values per group (`sorted(x.unique().tolist())`), merges into `edges_df`, passes to each `GraphEdge`
- Frontend `GraphEdge` type (`lib/types.ts`) gains `case_ids: string[]`
- `EdgeDetail` (`explore/page.tsx`) shows first 5 case IDs in a monospaced list under **"Case IDs (N)"** header; "Copy all" button writes all IDs newline-separated to clipboard, briefly shows "Copied!"

### Step 12 — Edge curvature drag ✅ (branch BIBKPLY-2168)
- `ProcessGraph.tsx` — edges (non-loop) can be dragged to bend their curvature
- `edgeCurvaturesRef` (ref, no re-renders) stores current curvature per edge ID
- `dragRef` stores active drag state: edge ID, start rendered position, start curvature, pre-computed perpendicular unit vector of the edge direction
- `loopEdgeIdsRef` mirrors the `loopEdgeIds` prop so Cytoscape event handlers don't go stale
- On edge `mousedown`: records drag state, disables Cytoscape panning, sets cursor to `grabbing`
- Document-level `mousemove`: projects mouse delta onto the edge perpendicular, converts rendered px → model coords (`/ cy.zoom()`), applies `curve-style: unbundled-bezier` + `control-point-distances` inline on the edge
- Document-level `mouseup`: clears drag state, re-enables panning, resets cursor
- Edge `dblclick`: resets curvature (`edge.removeStyle('curve-style control-point-distances')`)
- Cursor shows `grab` on hover over draggable edges

### Step 13 — Resizable panels ✅ (branch BIBKPLY-2168)
- `ResizeHandle` component added to `explore/page.tsx` — thin strip (4 px), turns blue on hover, exposes `direction: "vertical" | "horizontal"` and `onDelta: (delta: number) => void`
- Uses document-level `mousemove`/`mouseup` with incremental delta (not absolute) for smooth tracking even when pointer leaves the strip
- Filter panel width: state `filterWidth` (default 256, min 160, max 400), `onDelta={(d) => setFilterWidth(w => clamp(w + d, ...))}`, handle between left aside and main
- Detail panel width: state `detailWidth` (default 288, min 200, max 500), `onDelta={(d) => setDetailWidth(w => clamp(w - d, ...))}` (negated — handle is on the LEFT of the right panel)
- Variants table height: state `variantsHeight` (default 192, min 80, max 400), `onDelta={(d) => setVariantsHeight(h => clamp(h - d, ...))}` (negated — handle is the TOP border of the bottom section, drag up = taller)
- Panel borders removed; `ResizeHandle` serves as the visual separator

### Step 14 — Collapsible filter sections ✅ (branch BIBKPLY-2168)
- `FilterSection` in `explore/page.tsx` now owns a `useState(true)` open/closed toggle
- Title row is a `<button>` with a `ChevronDown` icon (rotates −90° when collapsed)
- Children are conditionally rendered; each section collapses independently

### Step 15 — Case ID filter ✅ (branch BIBKPLY-2168)
- `ProcessFilters` schema (`backend/api/schemas/process.py`) gains `case_ids: list[str] | None = None`
- `filters.py` — applied **first** (before date range, activity, dimension, variant filters) as the most selective case-level filter: `df = df[df["case_id"].isin(filters.case_ids)]`
- Frontend `ProcessFilters` type (`lib/types.ts`) gains `case_ids?: string[]`
- New "Case IDs" `FilterSection` at the **top** of the filter panel — `<textarea>` (3 rows, monospace), parses IDs split on newlines/spaces/commas, deduplicates
- Commits to store on blur (avoids rapid re-fetches while typing)
- Shows "N cases selected" counter below the textarea while input is non-empty
- `hasActive` and `handleReset` updated to include case_ids

### Step 16 — Positional column mapping defaults ✅ (branch BIBKPLY-2168)
- `ColumnMapper.tsx` — `autoDetect` replaced from alias-based matching to positional: column[0] → `case_id`, column[1] → `activity_name`, column[2] → `timestamp`; all optional fields left unmapped
- `ALIASES` constant removed (no longer used)
- Alias detection was heuristic and often wrong for arbitrary CSVs; positional default is more predictable

### Step 17 — Incoming/outgoing pie charts in detail panel ✅ (branch BIBKPLY-2168)
- `NodeFlowChart` SVG donut chart added to `explore/page.tsx` (no external deps)
- Two instances in `NodeDetail`: **Incoming** (blues/oranges palette) and **Outgoing** (same `FLOW_COLORS` palette, offset by number of extra items)
- Each slice is proportional to edge `count`; hovering dims other slices to 30% opacity
- Legend shows absolute case count + percentage per slice with `tabular-nums`
- Single-segment edge case handled by clamping arc span to `2π − 0.001` so SVG endpoints never coincide
- `isDark` threaded from `ExplorePage` → `DetailPanel` → `NodeDetail` → `NodeFlowChart` for correct SVG text colours
- `FLOW_COLORS` palette: 8 perceptually distinct hues (blue, orange, violet, emerald, pink, yellow, sky, red)
- `GraphNode` schema (`backend/api/schemas/process.py`) gains `start_count: int = 0`
- `miner.py` populates `start_count` from the already-computed `start_counts` Series

### Step 18 — Synthetic Start / End nodes + node count recalculation ✅ (branch BIBKPLY-2168)
- `GraphNode` schema gains `end_count: int = 0`; `miner.py` populates it from `end_counts` Series
- `graphWithSynthetic` useMemo in `ExplorePage` builds an augmented graph (never sent to backend):
  - Prepends `[Synthetic] Start` node with one edge per start activity (`count = node.start_count`)
  - Appends `[Synthetic] End` node with one edge per end activity (`count = node.end_count`)
  - Passed to both `ProcessGraph` and `DetailPanel` so detail-panel charts show synthetic edges too
- Every activity now has balanced inflow = outflow; the detail panel's Incoming chart for start activities shows `[Synthetic] Start` as a source instead of the old "New cases" special slice
- `ProcessGraph.tsx` — `buildElements` updated:
  - `effectiveCount = max(inflow, outflow)` — handles synthetic Start (outflow only) and End (inflow only) correctly; `+ start_count` removed (synthetic edges carry it)
  - `maxEdgeCount` computed from non-synthetic edges only so synthetic edges don't compress the regular edge thickness scale
  - `SYNTHETIC_PREFIX = "[Synthetic]"` used to detect synthetic nodes/edges and assign `synthetic-node` / `synthetic-edge` CSS classes
- Stylesheet additions: `synthetic-node` (dashed border, italic text, muted colour) and `synthetic-edge` (dashed line, muted colour) — both dark-mode aware
- Min-edge-frequency filter recalculates displayed node counts: when edges are removed, node labels reflect only the visible inflow; synthetic edges are always present and unaffected by the filter

### Step 19 — Horizontal preset layout + distance-proportional edge curvature ✅ (branch BIBKPLY-2168)
- Layout switched from dagre to `preset` with manually computed positions:
  - Regular activity nodes: flat horizontal row at `y = 0`, spaced `ACT_STEP = 400px` apart, ordered by `avg_position`
  - `[Synthetic] Start`: `{ x: -260, y: +260 }` (below-left of first activity)
  - `[Synthetic] End`: `{ x: lastIdx * 400 + 260, y: -260 }` (above-right of last activity)
- All edges use `curve-style: unbundled-bezier` with `control-point-distances: data(controlPointDistance)`
- Curvature is distance-proportional (`edgeDist * 0.3`), negated for edges going to `[Synthetic] End` so they fan symmetrically inward
- Forward-adjacent pairs (activity[i] → activity[i+1] in order) get `controlPointDistance = 0` (straight lines); all other edges get curvature
- Happy path feature removed entirely (was previously amber edges from top variant)
- Synthetic nodes/edges hidden via `display: none` in Cytoscape stylesheet (not by changing the graph prop) so toggling visibility does not trigger a remount or reset the layout
- `graphWithSynthetic` is always passed to `ProcessGraph`; the `showSynthetic` flag only controls the stylesheet rule
- `graphKey` includes `activityOrder.join(",")` so changing activity order forces a remount with recomputed positions

### Step 20 — Pinned colours for special nodes in pie charts ✅ (branch BIBKPLY-2168)
- `PINNED_COLORS` map in `explore/page.tsx`:
  - `[Synthetic] Start` → `#94a3b8` (slate-400)
  - `[Synthetic] End` → `#64748b` (slate-500)
  - `Lost` → `#f87171` (red-400)
- `NodeFlowChart` assigns pinned colours before advancing the palette index, so unpinned activities get consistent positions in `FLOW_COLORS` regardless of how many pinned items appear

### Step 21 — Activity order drag-and-drop section ✅ (branch BIBKPLY-2168)
- `ActivityOrderList` component in `explore/page.tsx` — HTML5 drag-and-drop list of activity names
  - Live reorder during drag (`onDragOver`); commits to parent only on `onDragEnd`
  - Shows avg position % next to each item as a guide
  - "Reset to default" button appears when order differs from `defaultActivityOrder`
- `defaultActivityOrder` in `ExplorePage`: activities sorted by `avg_position`, recomputed when `data` changes
- `customActivityOrder` state: `null` = use default, otherwise the user-defined array; reset to `null` whenever `data` changes (new filter response)
- `activityOrder = customActivityOrder ?? defaultActivityOrder` passed to both `ProcessGraph` and `ActivityOrderList`
- Changing the order remounts Cytoscape (via `graphKey`) with positions recomputed from the new order

### Step 22 — Configuration panel redesign ✅ (branch BIBKPLY-2168)
- Left panel header renamed from "Filters" to "Configuration"
- `FilterPanel` split into two visual subsections using full-width background strips (`-mx-4 px-4 py-2 bg-gray-50`):
  - **Display Settings**: Show synthetic checkbox + Reset layout button + Activity Order list
  - **Filters**: Case IDs, Date Range, Activities, Min Edge Frequency, Variants, Dimension filters, Reset Filters button
- `FilterSection` component redesigned: removed `mb-4 pb-4` (which left large gaps when collapsed); now uses `border-b border-gray-100` as separator and `py-2.5` on the header button so collapsed sections are compact; content wrapped in `<div className="pb-3">` only when open
- Subsection headers visually distinct from `FilterSection` titles (full-width tinted strip vs inline label)

### Step 23 — Reset layout button ✅ (branch BIBKPLY-2168)
- "Reset layout" button in the Display Settings section resets both node positions and edge curvatures
- `onResetLayout` in `ExplorePage` calls `setResetLayoutKey((k) => k + 1)`
- `ProcessGraph` now implements `resetLayoutKey` properly:
  - `cyRef` (ref, always holds the live Cytoscape instance) — avoids racing with instance teardown when `graphKey` also changes
  - `defaultPositionsRef` (ref, populated via `useEffect([elements])`) — always holds the latest computed default positions from `buildElements`
  - `useEffect([resetLayoutKey])` — fires only when the button is clicked; imperatively restores all node positions from `defaultPositionsRef` via `cy.batch()`, clears `edgeCurvaturesRef`, removes all inline `curve-style`/`control-point-distances` styles (stylesheet `data(controlPointDistance)` takes over), then calls `cy.fit()`
- Skips when `resetLayoutKey === 0` (initial render)

### Bug fix — activity order reset on Min Edge Frequency change ✅ (branch BIBKPLY-2168)
- **Symptom:** dragging activities to a custom order in the left panel, then adjusting the Min Edge Frequency slider, caused the panel order to snap back to the default (avg_position) sort.
- **Root cause (two-part):**
  1. `useEffect(() => { setCustomActivityOrder(null); }, [data])` — fired on every `data` change, including edge-only filter changes that leave the node set identical.
  2. Even after guarding by comparing node IDs, the guard itself was flawed: TanStack Query sets `data = undefined` while a new fetch is in-flight (each unique filter combination is a separate cache key). During that loading window `data?.graph.nodes ?? []` evaluated to `[]`, producing `ids = ""`, which didn't match the stored ID string → `setCustomActivityOrder(null)` fired before the new response arrived.
- **Fix:** `explore/page.tsx` — the `useEffect` now:
  1. Returns early when `data` is `undefined` (loading phase).
  2. Computes a sorted node-ID fingerprint and only calls `setCustomActivityOrder(null)` when the fingerprint changes — i.e. when activities are actually added or removed (activity exclusion, variant filter), not when only edge data changes.

---

## Layout / graph constants (current)

```ts
const ACT_STEP = 400;          // px between activity node centres (horizontal)
const DIAG_X   = 260;          // horizontal offset of synthetic Start/End
const DIAG_Y   = 260;          // vertical offset (Start is +y below row, End is -y above row)
const SYNTHETIC_PREFIX = "[Synthetic]";
const LAYOUT = { name: "preset", fit: true, padding: 50, animate: false };
```

`graphKey` (controls Cytoscape remount):
```ts
graph.nodes.map(n => n.id).sort().join("|") + "|" + activityOrder.join(",")
```

---

## Possible next steps

- Add backend tests for `filters.py` (currently only miner/parser/variants are tested)
- Persist `sessionId` + `columnMapping` in `localStorage` so page refresh doesn't lose state
- Add a `generate_sample_data.py` script to produce synthetic event logs of configurable size
- Deploy: add Caddy/Nginx reverse proxy to `docker-compose.yml` for a one-command VPS deploy
