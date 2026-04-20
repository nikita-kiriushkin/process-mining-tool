"""
Statistics & Insights: dimensional breakdown computation.

For each dimension column (team, region, status, resource) and each of its
distinct values, compute per-activity case counts and average wait times for
the subset of cases that include at least one event with that dimension value.
"""

import math

import pandas as pd

from api.schemas.process import DimensionActivityStats, DimensionSlice, StatisticsData

# Maximum number of slices to compute per dimension to keep response size reasonable.
_MAX_SLICES = 20


def _safe(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def compute_statistics(
    df: pd.DataFrame,
    available_dimensions: dict[str, list[str]],
) -> StatisticsData:
    """
    Compute dimensional breakdowns from the already-filtered event log.

    For each dimension × value combination, we:
      1. Identify cases that have ≥1 event where dim == value.
      2. Compute unique case counts per activity within that segment.
      3. Compute average wait-before (time from preceding event) per activity.

    All computation is done in a single vectorised pass per dimension using
    groupby rather than a per-value inner loop, for performance.
    """
    breakdowns: list[DimensionSlice] = []

    dim_cols = [
        c for c in ("resource", "team", "region", "status")
        if c in df.columns and c in available_dimensions
    ]

    if not dim_cols:
        return StatisticsData(dimensional_breakdowns=[])

    # Pre-compute consecutive-pair durations once for the entire filtered df.
    # This avoids rebuilding df_shifted per segment.
    df_pairs = _build_pairs(df)

    for dim in dim_cols:
        values = available_dimensions[dim]
        # Limit to the top _MAX_SLICES values by the number of matching cases
        # (all values if ≤ _MAX_SLICES).
        if len(values) > _MAX_SLICES:
            value_case_counts = (
                df.groupby(dim)["case_id"].nunique()
                .nlargest(_MAX_SLICES)
            )
            values = list(value_case_counts.index)

        for val in values:
            str_val = str(val)
            # Cases that have at least one event with this dim value
            matching_cases = (
                df[df[dim].astype(str) == str_val]["case_id"].unique()
            )
            total_cases = len(matching_cases)
            if total_cases == 0:
                continue

            case_set = set(matching_cases)
            sub_df = df[df["case_id"].isin(case_set)]

            # Unique case count per activity in this segment
            act_case_counts = (
                sub_df.groupby("activity_name")["case_id"].nunique()
            )

            # Average wait before each activity within this segment
            avg_wait: dict[str, float | None] = {}
            if df_pairs is not None:
                sub_pairs = df_pairs[df_pairs["case_id"].isin(case_set)]
                if not sub_pairs.empty:
                    avg_wait_series = (
                        sub_pairs.groupby("_next_activity")["_duration_ms"].mean()
                    )
                    avg_wait = {k: _safe(v) for k, v in avg_wait_series.items()}

            activities = [
                DimensionActivityStats(
                    activity=act,
                    case_count=int(cnt),
                    pct_of_segment=round(cnt / total_cases, 4),
                    avg_duration_before_ms=avg_wait.get(act),
                )
                for act, cnt in act_case_counts.items()
            ]
            # Sort by case count descending for readability
            activities.sort(key=lambda x: -x.case_count)

            breakdowns.append(
                DimensionSlice(
                    dimension=dim,
                    value=str_val,
                    total_cases=int(total_cases),
                    activities=activities,
                )
            )

    return StatisticsData(dimensional_breakdowns=breakdowns)


def _build_pairs(df: pd.DataFrame) -> pd.DataFrame | None:
    """
    Build a DataFrame of consecutive-event pairs with _duration_ms per pair.
    Returns None if the DataFrame has fewer than 2 events (no pairs possible).
    """
    if len(df) < 2:
        return None

    df_s = df[["case_id", "activity_name", "timestamp"]].copy()
    groups = df_s.groupby("case_id", sort=False)
    df_s["_next_activity"] = groups["activity_name"].shift(-1)
    df_s["_next_timestamp"] = groups["timestamp"].shift(-1)
    df_s = df_s.dropna(subset=["_next_activity"]).copy()
    if df_s.empty:
        return None

    df_s["_duration_ms"] = (
        df_s["_next_timestamp"] - df_s["timestamp"]
    ).dt.total_seconds() * 1000

    return df_s
