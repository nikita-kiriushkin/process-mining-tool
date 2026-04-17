"""
Variant extraction.

A variant is the ordered sequence of activity names for a single case.
We rank variants by frequency and compute per-variant statistics.
"""

import pandas as pd

from api.schemas.process import ProcessVariant, SummaryMetrics


def extract_variants(df: pd.DataFrame) -> dict:
    """
    Returns:
        {
            "variants": list[ProcessVariant],
            "summary_and_dims": {
                "summary": SummaryMetrics,          # passed through from miner
                "available_activities": list[str],
                "available_dimensions": dict[str, list[str]],
            }
        }

    Note: summary/dims are NOT computed here (miner.py owns them).
    This function only returns the variants list.
    Caller (routes/process.py) assembles the final response.
    """
    # Build variant sequence per case
    case_sequences = (
        df.sort_values(["case_id", "timestamp"])
        .groupby("case_id")["activity_name"]
        .apply(tuple)
        .reset_index(name="variant")
    )

    total_cases = case_sequences["case_id"].nunique()

    variant_counts = (
        case_sequences.groupby("variant")
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
        .reset_index(drop=True)
    )

    # Merge back case_ids to compute per-variant duration
    merged = case_sequences.merge(variant_counts, on="variant")
    df_with_variant = df.merge(
        case_sequences.rename(columns={"variant": "_variant"}),
        on="case_id",
    )

    # Per-case duration
    case_durations = (
        df_with_variant.groupby("case_id")["timestamp"]
        .agg(lambda x: (x.max() - x.min()).total_seconds() * 1000)
        .reset_index(name="duration_ms")
    )
    case_with_duration = case_sequences.merge(case_durations, on="case_id")
    variant_duration = (
        case_with_duration.groupby("variant")["duration_ms"]
        .mean()
        .reset_index(name="avg_duration_ms")
    )

    variant_counts = variant_counts.merge(variant_duration, on="variant", how="left")

    variants: list[ProcessVariant] = []
    for idx, row in variant_counts.iterrows():
        variants.append(
            ProcessVariant(
                variant_id=int(idx) + 1,
                activities=list(row["variant"]),
                count=int(row["count"]),
                frequency_ratio=round(row["count"] / total_cases, 4) if total_cases else 0.0,
                avg_duration_ms=float(row["avg_duration_ms"]) if pd.notna(row["avg_duration_ms"]) else None,
            )
        )

    return {"variants": variants}
