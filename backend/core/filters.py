"""
Filter application on the normalised event log DataFrame.

Filters are applied before DFG construction so graph metrics reflect
only the filtered subset of cases/events.
"""

import pandas as pd

from api.schemas.process import ProcessFilters, ColumnMapping


def apply_filters(df: pd.DataFrame, filters: ProcessFilters, mapping: ColumnMapping) -> pd.DataFrame:
    """
    Apply all active filters to the event log.

    Case-level filters (date range, variant, dimension) remove entire cases.
    Activity filters remove individual events (then re-evaluate case presence).
    Edge frequency filter is applied post-graph-construction in the /process route.
    """
    if df.empty:
        return df

    # ── Case ID filter ────────────────────────────────────────────────────────
    if filters.case_ids:
        df = df[df["case_id"].isin(filters.case_ids)]

    # ── Date range filter ─────────────────────────────────────────────────────
    # Filter based on the *first* event timestamp of each case
    if filters.date_from or filters.date_to:
        case_first = df.groupby("case_id")["timestamp"].min()
        if filters.date_from:
            date_from = pd.to_datetime(filters.date_from)
            valid_cases = case_first[case_first >= date_from].index
            df = df[df["case_id"].isin(valid_cases)]
        if filters.date_to:
            date_to = pd.to_datetime(filters.date_to)
            valid_cases = case_first[case_first <= date_to].index
            df = df[df["case_id"].isin(valid_cases)]

    # ── Activity filters ──────────────────────────────────────────────────────
    if filters.include_activities:
        df = df[df["activity_name"].isin(filters.include_activities)]

    if filters.exclude_activities:
        df = df[~df["activity_name"].isin(filters.exclude_activities)]

    # ── Dimension filters (region, team, resource, status) ────────────────────
    if filters.dimension_filters:
        for dim_col, allowed_values in filters.dimension_filters.items():
            if dim_col in df.columns and allowed_values:
                # Case-level: keep case if ANY event matches the dimension value
                matching_cases = df[df[dim_col].isin(allowed_values)]["case_id"].unique()
                df = df[df["case_id"].isin(matching_cases)]

    # ── Variant filter ────────────────────────────────────────────────────────
    if filters.variant_ids:
        # Build variant sequences to identify matching cases
        case_sequences = (
            df.sort_values(["case_id", "timestamp"])
            .groupby("case_id")["activity_name"]
            .apply(tuple)
        )
        variant_rank = (
            case_sequences.value_counts()
            .reset_index()
            .rename(columns={"index": "variant", 0: "count"})
        )
        # variant_id is 1-based rank
        selected_variants = set()
        for vid in filters.variant_ids:
            if vid <= len(variant_rank):
                selected_variants.add(variant_rank.iloc[vid - 1]["variant"])

        if selected_variants:
            matching_cases = case_sequences[case_sequences.isin(selected_variants)].index
            df = df[df["case_id"].isin(matching_cases)]

    return df.reset_index(drop=True)
