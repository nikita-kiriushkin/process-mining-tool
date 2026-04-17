"""Tests for variant extraction."""

import pandas as pd

from core.variants import extract_variants


def _make_df(rows: list[tuple]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["case_id", "activity_name", "timestamp"])
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df.sort_values(["case_id", "timestamp"]).reset_index(drop=True)


LOG = _make_df([
    # variant A→B→C  (2 cases)
    ("C1", "A", "2024-01-01 09:00"),
    ("C1", "B", "2024-01-01 10:00"),
    ("C1", "C", "2024-01-01 11:00"),
    ("C2", "A", "2024-01-02 09:00"),
    ("C2", "B", "2024-01-02 10:00"),
    ("C2", "C", "2024-01-02 11:00"),
    # variant A→C  (1 case)
    ("C3", "A", "2024-01-03 09:00"),
    ("C3", "C", "2024-01-03 10:00"),
])


def test_variant_count():
    result = extract_variants(LOG)
    assert len(result["variants"]) == 2


def test_most_frequent_variant_first():
    result = extract_variants(LOG)
    top = result["variants"][0]
    assert top.activities == ["A", "B", "C"]
    assert top.count == 2


def test_variant_ids_sequential():
    result = extract_variants(LOG)
    ids = [v.variant_id for v in result["variants"]]
    assert ids == list(range(1, len(ids) + 1))


def test_frequency_ratios_sum_to_one():
    result = extract_variants(LOG)
    total = sum(v.frequency_ratio for v in result["variants"])
    assert abs(total - 1.0) < 0.001
