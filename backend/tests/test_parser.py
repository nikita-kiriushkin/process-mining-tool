"""Tests for CSV parsing and validation."""

import os
import tempfile
import pandas as pd
import pytest

from core.parser import parse_csv_preview, parse_event_log
from api.schemas.process import ColumnMapping

MAPPING = ColumnMapping(case_id="case_id", activity_name="activity", timestamp="ts")


def _write_csv(content: str) -> str:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w")
    tmp.write(content)
    tmp.close()
    return tmp.name


def _cleanup(path: str):
    if os.path.exists(path):
        os.unlink(path)


# ── parse_csv_preview ─────────────────────────────────────────────────────────

def test_preview_returns_columns_and_row_count():
    path = _write_csv("case_id,activity,ts\nC1,A,2024-01-01\nC2,B,2024-01-02\n")
    try:
        result = parse_csv_preview(path)
        assert set(result["columns"]) == {"case_id", "activity", "ts"}
        assert result["row_count"] == 2
        assert len(result["sample_rows"]) == 2
    finally:
        _cleanup(path)


def test_preview_empty_file_raises():
    path = _write_csv("case_id,activity,ts\n")
    try:
        with pytest.raises(ValueError, match="no data"):
            parse_csv_preview(path)
    finally:
        _cleanup(path)


# ── parse_event_log ───────────────────────────────────────────────────────────

def test_parse_basic_event_log():
    path = _write_csv(
        "case_id,activity,ts\n"
        "C1,A,2024-01-01 10:00:00\n"
        "C1,B,2024-01-01 11:00:00\n"
        "C2,A,2024-01-02 09:00:00\n"
    )
    try:
        df = parse_event_log(path, MAPPING)
        assert list(df.columns[:3]) == ["case_id", "activity_name", "timestamp"]
        assert len(df) == 3
        assert df["timestamp"].dtype == "datetime64[ns]"
    finally:
        _cleanup(path)


def test_parse_sorts_by_case_and_time():
    path = _write_csv(
        "case_id,activity,ts\n"
        "C1,B,2024-01-01 11:00:00\n"
        "C1,A,2024-01-01 09:00:00\n"
    )
    try:
        df = parse_event_log(path, MAPPING)
        assert df.iloc[0]["activity_name"] == "A"
        assert df.iloc[1]["activity_name"] == "B"
    finally:
        _cleanup(path)


def test_parse_missing_required_column_raises():
    path = _write_csv("case_id,activity\nC1,A\n")
    try:
        with pytest.raises(ValueError):
            parse_event_log(path, MAPPING)
    finally:
        _cleanup(path)


def test_parse_bad_timestamp_raises():
    path = _write_csv("case_id,activity,ts\nC1,A,not-a-date\n")
    try:
        with pytest.raises(ValueError, match="timestamp"):
            parse_event_log(path, MAPPING)
    finally:
        _cleanup(path)
