// ── Column mapping ────────────────────────────────────────────────────────────

export interface ColumnMapping {
  case_id: string;
  activity_name: string;
  timestamp: string;
  resource?: string;
  team?: string;
  region?: string;
  status?: string;
  cost?: string;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export interface UploadResponse {
  session_id: string;
  columns: string[];
  row_count: number;
  sample_rows: Record<string, string>[];
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  count: number;
  case_count: number;
  start_count: number;
  end_count: number;
  avg_duration_before_ms: number | null;
  median_duration_before_ms: number | null;
  min_duration_before_ms: number | null;
  max_duration_before_ms: number | null;
  avg_position: number;
  is_start: boolean;
  is_end: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  count: number;
  avg_duration_ms: number | null;
  median_duration_ms: number | null;
  min_duration_ms: number | null;
  max_duration_ms: number | null;
  frequency_ratio: number;
  case_ids: string[];
  dimension_counts: Record<string, Record<string, number>>;
  dimension_durations: Record<string, Record<string, number | null>>;
}

export interface ProcessGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Variants ──────────────────────────────────────────────────────────────────

export interface ProcessVariant {
  variant_id: number;
  activities: string[];
  count: number;
  frequency_ratio: number;
  avg_duration_ms: number | null;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface SummaryMetrics {
  total_cases: number;
  total_events: number;
  avg_case_length: number;
  most_frequent_start: string;
  most_frequent_end: string;
  date_min: string;
  date_max: string;
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ProcessFilters {
  date_from?: string;
  date_to?: string;
  include_activities?: string[];
  exclude_activities?: string[];
  min_edge_frequency?: number;
  variant_ids?: number[];
  dimension_filters?: Record<string, string[]>;
  case_ids?: string[];
}

// ── Statistics ────────────────────────────────────────────────────────────────

export interface DimensionActivityStats {
  activity: string;
  case_count: number;
  pct_of_segment: number;
  avg_duration_before_ms: number | null;
}

export interface DimensionSlice {
  dimension: string;
  value: string;
  total_cases: number;
  activities: DimensionActivityStats[];
}

export interface StatisticsData {
  dimensional_breakdowns: DimensionSlice[];
}

// ── Process response ──────────────────────────────────────────────────────────

export interface ProcessResponse {
  graph: ProcessGraph;
  variants: ProcessVariant[];
  summary: SummaryMetrics;
  available_activities: string[];
  available_dimensions: Record<string, string[]>;
  statistics: StatisticsData;
}

// ── Selected element (for detail panel) ──────────────────────────────────────

export type SelectedElement =
  | { type: "node"; id: string; data: GraphNode }
  | { type: "edge"; id: string; data: GraphEdge }
  | null;
