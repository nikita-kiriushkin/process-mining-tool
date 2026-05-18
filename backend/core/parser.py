"""
CSV parsing and validation.

parse_csv_preview  – fast metadata read (columns, row count, sample rows)
parse_event_log    – full parse + type coercion, returns a normalised DataFrame
                     with columns: case_id, activity_name, timestamp, [optional dims]
"""

import pandas as pd
from api.schemas.process import ColumnMapping

SAMPLE_ROWS = 5
MAX_COLUMNS = 50


def parse_csv_preview(file_path: str) -> dict:
    try:
        df = pd.read_csv(file_path, nrows=SAMPLE_ROWS + 1)
    except Exception as e:
        raise ValueError(f"Cannot read CSV: {e}")

    if df.shape[1] > MAX_COLUMNS:
        raise ValueError(f"CSV has too many columns ({df.shape[1]}). Maximum is {MAX_COLUMNS}.")

    # Full row count (cheap with engine='c')
    full_df = pd.read_csv(file_path, usecols=[df.columns[0]])
    row_count = len(full_df)

    if row_count == 0:
        raise ValueError("CSV has no data rows.")

    sample = df.head(SAMPLE_ROWS).fillna("").astype(str).to_dict(orient="records")

    return {
        "columns": list(df.columns),
        "row_count": row_count,
        "sample_rows": sample,
    }


def parse_event_log(file_path: str, mapping: ColumnMapping) -> pd.DataFrame:
    """
    Load the full event log and return a normalised DataFrame.

    Normalised columns:
        case_id        (str)
        activity_name  (str)
        timestamp      (datetime64[ns])
        + any optional mapped columns kept under their canonical names
    """
    required_source_cols = [mapping.case_id, mapping.activity_name, mapping.timestamp]
    # dimensions: {label → source_col}; deduplicate source cols preserving order
    optional_source_cols = list(dict.fromkeys(v for v in mapping.dimensions.values() if v))

    use_cols = list(dict.fromkeys(required_source_cols + optional_source_cols))

    try:
        df = pd.read_csv(file_path, usecols=use_cols, low_memory=False)
    except ValueError as e:
        raise ValueError(f"Column selection error: {e}")

    # Rename source columns to canonical / display names
    rename = {
        mapping.case_id: "case_id",
        mapping.activity_name: "activity_name",
        mapping.timestamp: "timestamp",
    }
    for label, source_col in mapping.dimensions.items():
        if source_col and source_col not in rename:
            rename[source_col] = label

    df = df.rename(columns=rename)

    # Validate required columns have no nulls
    for col in ("case_id", "activity_name", "timestamp"):
        null_count = df[col].isna().sum()
        if null_count > 0:
            raise ValueError(f"Column '{col}' has {null_count} missing values.")

    # Parse timestamps
    try:
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=False)
    except Exception:
        raise ValueError(
            "Could not parse 'timestamp' column as datetime. "
            "Ensure it uses a standard format such as ISO 8601 or 'YYYY-MM-DD HH:MM:SS'."
        )

    df["case_id"] = df["case_id"].astype(str)
    df["activity_name"] = df["activity_name"].astype(str)

    # Sort by case and time — critical for DFG construction
    df = df.sort_values(["case_id", "timestamp"]).reset_index(drop=True)

    return df
