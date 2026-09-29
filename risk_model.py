from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

MODEL_PATH = Path("models/road_risk_model.joblib")
METADATA_PATH = Path("models/model_metadata.json")

RISK_WEIGHT = {
    "Low": 1.0,
    "Medium": 1.5,
    "High": 2.5,
}

LABEL_TO_RISK = {
    "No_Accident": "Low",
    "No_accident": "Low",
    "Minor": "Medium",
    "Major": "High",
}


class RiskModel:
    def __init__(self, model_path: Path = MODEL_PATH):
        if not model_path.exists():
            raise FileNotFoundError(
                f"Trained model not found at {model_path}. Run train_model.py first."
            )
        self.model = joblib.load(model_path)
        self.metadata: dict[str, Any] = {}
        if METADATA_PATH.exists():
            self.metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))

    def predict(self, features: dict[str, Any]) -> dict[str, Any]:
        frame = pd.DataFrame([features])
        label = str(self.model.predict(frame)[0])
        probabilities = self.model.predict_proba(frame)[0]
        classes = list(self.model.named_steps["model"].classes_)
        prob_map = {str(c): float(p) for c, p in zip(classes, probabilities)}
        risk = LABEL_TO_RISK.get(label, label)
        return {
            "label": label,
            "risk": risk,
            "weight": RISK_WEIGHT.get(risk, 1.0),
            "probabilities": prob_map,
        }
