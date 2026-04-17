"""Tests for DFG construction and metrics."""

import pandas as pd
import pytest

from core.miner import build_process_graph


def _make_df(rows: list[tuple]) -> pd.DataFrame:
    """rows: (case_id, activity_name, timestamp_str)"""
    df = pd.DataFrame(rows, columns=["case_id", "activity_name", "timestamp"])
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df.sort_values(["case_id", "timestamp"]).reset_index(drop=True)


SIMPLE_LOG = _make_df([
    ("C1", "A", "2024-01-01 09:00"),
    ("C1", "B", "2024-01-01 10:00"),
    ("C1", "C", "2024-01-01 11:00"),
    ("C2", "A", "2024-01-02 09:00"),
    ("C2", "B", "2024-01-02 10:30"),
    ("C3", "A", "2024-01-03 09:00"),
    ("C3", "C", "2024-01-03 10:00"),
])


def test_node_count():
    result = build_process_graph(SIMPLE_LOG)
    node_ids = {n.id for n in result["graph"].nodes}
    assert node_ids == {"A", "B", "C"}


def test_node_counts_correct():
    result = build_process_graph(SIMPLE_LOG)
    counts = {n.id: n.count for n in result["graph"].nodes}
    assert counts["A"] == 3
    assert counts["B"] == 2
    assert counts["C"] == 2


def test_edges_correct():
    result = build_process_graph(SIMPLE_LOG)
    edge_ids = {e.id for e in result["graph"].edges}
    assert "A→B" in edge_ids
    assert "B→C" in edge_ids
    assert "A→C" in edge_ids


def test_edge_frequency():
    result = build_process_graph(SIMPLE_LOG)
    edges = {e.id: e.count for e in result["graph"].edges}
    assert edges["A→B"] == 2
    assert edges["B→C"] == 1
    assert edges["A→C"] == 1


def test_start_end_flags():
    result = build_process_graph(SIMPLE_LOG)
    nodes = {n.id: n for n in result["graph"].nodes}
    assert nodes["A"].is_start is True
    assert nodes["A"].is_end is False
    assert nodes["C"].is_end is True
    assert nodes["C"].is_start is False


def test_summary_metrics():
    result = build_process_graph(SIMPLE_LOG)
    summary = result["summary"]
    assert summary.total_cases == 3
    assert summary.total_events == 7
    assert summary.avg_case_length == pytest.approx(7 / 3, rel=0.01)
    assert summary.most_frequent_start == "A"


def test_edge_duration_positive():
    result = build_process_graph(SIMPLE_LOG)
    for edge in result["graph"].edges:
        if edge.avg_duration_ms is not None:
            assert edge.avg_duration_ms > 0
