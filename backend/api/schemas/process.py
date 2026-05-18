from pydantic import BaseModel


class ColumnMapping(BaseModel):
    case_id: str
    activity_name: str
    timestamp: str
    # key = display label used as the internal DataFrame column name
    # value = source CSV column name
    dimensions: dict[str, str] = {}


class ProcessFilters(BaseModel):
    date_from: str | None = None
    date_to: str | None = None
    include_activities: list[str] | None = None
    exclude_activities: list[str] | None = None
    min_edge_frequency: int | None = None
    variant_ids: list[int] | None = None
    dimension_filters: dict[str, list[str]] | None = None
    case_ids: list[str] | None = None


class ProcessRequest(BaseModel):
    session_id: str
    column_mapping: ColumnMapping
    filters: ProcessFilters = ProcessFilters()


class GraphNode(BaseModel):
    id: str
    label: str
    count: int
    case_count: int = 0
    start_count: int = 0
    end_count: int = 0
    avg_duration_before_ms: float | None = None
    median_duration_before_ms: float | None = None
    min_duration_before_ms: float | None = None
    max_duration_before_ms: float | None = None
    avg_position: float
    is_start: bool
    is_end: bool


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    count: int
    avg_duration_ms: float | None = None
    median_duration_ms: float | None = None
    min_duration_ms: float | None = None
    max_duration_ms: float | None = None
    frequency_ratio: float
    case_ids: list[str] = []
    dimension_counts: dict[str, dict[str, int]] = {}
    dimension_durations: dict[str, dict[str, float | None]] = {}


class ProcessGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class ProcessVariant(BaseModel):
    variant_id: int
    activities: list[str]
    count: int
    frequency_ratio: float
    avg_duration_ms: float | None = None


class SummaryMetrics(BaseModel):
    total_cases: int
    total_events: int
    avg_case_length: float
    most_frequent_start: str
    most_frequent_end: str
    date_min: str
    date_max: str


# ── Statistics ─────────────────────────────────────────────────────────────────

class DimensionActivityStats(BaseModel):
    activity: str
    case_count: int
    pct_of_segment: float
    avg_duration_before_ms: float | None = None


class DimensionSlice(BaseModel):
    dimension: str
    value: str
    total_cases: int
    activities: list[DimensionActivityStats]


class StatisticsData(BaseModel):
    dimensional_breakdowns: list[DimensionSlice]


class ProcessResponse(BaseModel):
    graph: ProcessGraph
    variants: list[ProcessVariant]
    summary: SummaryMetrics
    available_activities: list[str]
    available_dimensions: dict[str, list[str]]
    statistics: StatisticsData
