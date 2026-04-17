"""
Process mining: Direct-Follows Graph (DFG) construction.

Takes a normalised DataFrame (output of parser.parse_event_log) and returns
a dict compatible with ProcessResponse schema fields: graph + summary.
"""

import pandas as pd
import numpy as np

from api.schemas.process import GraphNode, GraphEdge, ProcessGraph, SummaryMetrics


def build_process_graph(df: pd.DataFrame) -> dict:
    """
    Build DFG from normalised event log.

    Returns:
        {
            "graph": ProcessGraph,
            "summary": SummaryMetrics,
            "available_activities": list[str],
            "available_dimensions": dict[str, list[str]],
        }
    """
    cases = df.groupby("case_id", sort=False)

    # ── Node stats ───────────────────────────────────────────────────────────
    activity_counts = df["activity_name"].value_counts().to_dict()

    # Average position within a case (0=first, 1=last normalised)
    df = df.copy()
    df["_pos"] = cases["activity_name"].transform(lambda x: pd.Series(range(len(x)), index=x.index))
    df["_case_len"] = cases["activity_name"].transform("count")
    df["_norm_pos"] = df["_pos"] / (df["_case_len"] - 1).clip(lower=1)
    avg_position = df.groupby("activity_name")["_norm_pos"].mean().to_dict()

    # Start / end activities
    first_events = cases.first().reset_index()
    last_events = cases.last().reset_index()
    start_counts = first_events["activity_name"].value_counts()
    end_counts = last_events["activity_name"].value_counts()
    start_activities = set(start_counts.index)
    end_activities = set(end_counts.index)

    # ── Edge stats ────────────────────────────────────────────────────────────
    # Build consecutive-event pairs within each case
    df_shifted = df.copy()
    df_shifted["_next_activity"] = cases["activity_name"].shift(-1)
    df_shifted["_next_timestamp"] = cases["timestamp"].shift(-1)
    df_shifted = df_shifted.dropna(subset=["_next_activity"])

    df_shifted["_duration_ms"] = (
        df_shifted["_next_timestamp"] - df_shifted["timestamp"]
    ).dt.total_seconds() * 1000

    edge_groups = df_shifted.groupby(["activity_name", "_next_activity"])
    edge_counts = edge_groups.size().reset_index(name="count")
    edge_durations = edge_groups["_duration_ms"].mean().reset_index(name="avg_duration_ms")
    edge_case_ids = (
        edge_groups["case_id"]
        .apply(lambda x: sorted(x.unique().tolist()))
        .reset_index(name="case_ids")
    )
    edges_df = (
        edge_counts
        .merge(edge_durations, on=["activity_name", "_next_activity"])
        .merge(edge_case_ids, on=["activity_name", "_next_activity"])
    )

    total_edge_count = edges_df["count"].sum()

    # ── Waiting time before a node (incoming edge avg) ───────────────────────
    incoming_avg = (
        edges_df.groupby("_next_activity")
        .apply(lambda g: np.average(g["avg_duration_ms"], weights=g["count"]), include_groups=False)
        .to_dict()
    )

    # ── Assemble nodes ────────────────────────────────────────────────────────
    nodes = []
    for activity in activity_counts:
        nodes.append(
            GraphNode(
                id=activity,
                label=activity,
                count=activity_counts[activity],
                avg_duration_before_ms=incoming_avg.get(activity),
                avg_position=round(avg_position.get(activity, 0.5), 3),
                is_start=activity in start_activities,
                is_end=activity in end_activities,
            )
        )

    # ── Assemble edges ────────────────────────────────────────────────────────
    edge_objs = []
    for _, row in edges_df.iterrows():
        src = row["activity_name"]
        tgt = row["_next_activity"]
        cnt = int(row["count"])
        avg_dur = float(row["avg_duration_ms"]) if not pd.isna(row["avg_duration_ms"]) else None
        freq_ratio = cnt / total_edge_count if total_edge_count > 0 else 0.0
        case_ids = list(row["case_ids"]) if row["case_ids"] is not None else []
        edge_objs.append(
            GraphEdge(
                id=f"{src}→{tgt}",
                source=src,
                target=tgt,
                count=cnt,
                avg_duration_ms=avg_dur,
                frequency_ratio=round(freq_ratio, 4),
                case_ids=case_ids,
            )
        )

    # ── Summary metrics ───────────────────────────────────────────────────────
    total_cases = df["case_id"].nunique()
    total_events = len(df)
    avg_case_length = round(total_events / total_cases, 2) if total_cases else 0

    summary = SummaryMetrics(
        total_cases=total_cases,
        total_events=total_events,
        avg_case_length=avg_case_length,
        most_frequent_start=start_counts.index[0] if len(start_counts) else "",
        most_frequent_end=end_counts.index[0] if len(end_counts) else "",
        date_min=df["timestamp"].min().isoformat(),
        date_max=df["timestamp"].max().isoformat(),
    )

    # ── Available dimensions ──────────────────────────────────────────────────
    dim_cols = [c for c in ("resource", "team", "region", "status") if c in df.columns]
    available_dimensions = {
        col: sorted(df[col].dropna().astype(str).unique().tolist()) for col in dim_cols
    }

    return {
        "graph": ProcessGraph(nodes=nodes, edges=edge_objs),
        "summary": summary,
        "available_activities": sorted(activity_counts.keys()),
        "available_dimensions": available_dimensions,
    }
