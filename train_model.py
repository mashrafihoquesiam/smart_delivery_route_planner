from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

FEATURES = [
    "latitude",
    "longitude",
    "weather_condition",
    "road_surface",
    "junction_type",
    "light_condition",
    "time_of_day",
    "vehicle_type",
    "road_quality",
    "speed_limit_zone",
    "month",
    "road_class",
]
TARGET = "accident_severity"

RISK_NAME = {
    "No_Accident": "Low",
    "Minor": "Medium",
    "Major": "High",
}


def sample_csv(path: Path, max_rows: int, seed: int) -> pd.DataFrame:
    reservoir: pd.DataFrame | None = None
    rng = np.random.default_rng(seed)
    cols = FEATURES + [TARGET]
    for chunk in pd.read_csv(path, usecols=cols, chunksize=50_000):
        if len(chunk) == 0:
            continue
        if reservoir is None:
            reservoir = chunk.iloc[:min(max_rows, len(chunk))].copy()
            continue

        combined = pd.concat([reservoir, chunk], ignore_index=True)
        if len(combined) > max_rows:
            keep = rng.choice(len(combined), size=max_rows, replace=False)
            reservoir = combined.iloc[keep].reset_index(drop=True)
        else:
            reservoir = combined

    if reservoir is None or reservoir.empty:
        raise ValueError("No rows could be read from the dataset.")
    return reservoir.sample(frac=1.0, random_state=seed).reset_index(drop=True)


def sample_parquet_dir(path: Path, max_rows: int, seed: int) -> pd.DataFrame:
    try:
        import pyarrow.dataset as ds
    except ImportError as exc:
        raise RuntimeError("pyarrow is required for Parquet input.") from exc

    dataset = ds.dataset(path, format="parquet", partitioning="hive")
    cols = FEATURES + [TARGET]
    scanner = dataset.scanner(columns=cols, batch_size=50_000, use_threads=True)
    rng = np.random.default_rng(seed)
    reservoir: np.ndarray | None = None
    total = 0

    for batch in scanner.to_batches():
        frame = batch.to_pandas()
        arr = frame.to_records(index=False)
        if len(arr) == 0:
            continue
        if reservoir is None:
            take = min(max_rows, len(arr))
            idx = rng.choice(len(arr), size=take, replace=False)
            reservoir = arr[idx]
            total = len(arr)
            continue

        combined = np.concatenate([reservoir, arr])
        if len(combined) <= max_rows:
            reservoir = combined
        else:
            idx = rng.choice(len(combined), size=max_rows, replace=False)
            reservoir = combined[idx]
        total += len(arr)

    if reservoir is None:
        raise ValueError("No Parquet rows were found.")
    return pd.DataFrame.from_records(reservoir, columns=cols)


def load_data(path_str: str, max_rows: int, seed: int) -> pd.DataFrame:
    path = Path(path_str)
    if not path.exists():
        raise FileNotFoundError(f"Dataset path not found: {path}")
    if path.is_file() and path.suffix.lower() == ".csv":
        return sample_csv(path, max_rows, seed)
    if path.is_dir():
        parquet_files = list(path.rglob("*.parquet"))
        if parquet_files:
            return sample_parquet_dir(path, max_rows, seed)
        csv_files = list(path.rglob("*.csv"))
        if csv_files:
            return sample_csv(csv_files[0], max_rows, seed)
    raise ValueError("Expected a CSV file or a folder containing Parquet/CSV files.")


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for col in FEATURES:
        if col not in df.columns:
            raise ValueError(f"Missing required feature: {col}")
    if TARGET not in df.columns:
        raise ValueError(f"Missing target column: {TARGET}")

    df = df.dropna(subset=[TARGET])
    for col in FEATURES:
        if df[col].dtype == "object":
            df[col] = df[col].fillna("Unknown").astype(str)
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df[col] = df[col].fillna(df[col].median())
    df[TARGET] = df[TARGET].astype(str).str.strip().replace({"No_accident": "No_Accident"})
    return df


def build_pipeline() -> Pipeline:
    categorical = [c for c in FEATURES if c not in {"latitude", "longitude", "month", "speed_limit_zone"}]
    numeric = ["latitude", "longitude", "month", "speed_limit_zone"]

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numeric),
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
        ]
    )

    model = LogisticRegression(
        max_iter=1200,
        class_weight="balanced",
        random_state=42,
    )

    return Pipeline(
        steps=[("preprocessor", preprocessor), ("model", model)]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Train SmartRoute BD road-risk classifier.")
    parser.add_argument("--data", required=True, help="CSV file or extracted Parquet folder")
    parser.add_argument("--max-rows", type=int, default=250_000)
    parser.add_argument("--test-size", type=float, default=0.20)
    parser.add_argument("--output", default="models/road_risk_model.joblib")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    print("[1/5] Loading public dataset sample...")
    df = load_data(args.data, args.max_rows, args.seed)
    print(f"Loaded {len(df):,} rows")

    print("[2/5] Cleaning data...")
    df = clean_data(df)
    print("Target distribution:")
    print(df[TARGET].value_counts(normalize=True).round(4))

    X = df[FEATURES]
    y = df[TARGET]

    print("[3/5] Train/test split...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, stratify=y, random_state=args.seed
    )

    print("[4/5] Training Logistic Regression...")
    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    print("[5/5] Evaluating...")
    pred = pipeline.predict(X_test)
    accuracy = accuracy_score(y_test, pred)
    f1 = f1_score(y_test, pred, average="weighted")
    labels = list(pipeline.named_steps["model"].classes_)

    print(f"Accuracy: {accuracy:.4f}")
    print(f"Weighted F1: {f1:.4f}")
    print("\nClassification report:")
    print(classification_report(y_test, pred, zero_division=0))
    print("Confusion matrix:")
    print(confusion_matrix(y_test, pred, labels=labels))

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, output)

    metadata = {
        "features": FEATURES,
        "target": TARGET,
        "classes": labels,
        "class_to_route_risk": {c: RISK_NAME.get(c, c) for c in labels},
        "rows_used": int(len(df)),
        "test_size": args.test_size,
        "accuracy": float(accuracy),
        "weighted_f1": float(f1),
        "note": "Model trained for student project route-risk scoring. Dataset is synthetic BDRoadRisk data; route graph comes from OpenStreetMap.",
    }
    meta_path = output.with_name("model_metadata.json")
    meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"\nSaved model to: {output}")
    print(f"Saved metadata to: {meta_path}")


if __name__ == "__main__":
    main()
