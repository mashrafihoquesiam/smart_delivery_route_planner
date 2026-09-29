#!/usr/bin/env bash
set -e
if [ ! -d "data/bdroad_risk" ]; then
  echo "Missing data/bdroad_risk/"
  echo "Download and extract BDRoadRisk Parquet archive there first."
  exit 1
fi
python train_model.py --data data/bdroad_risk --max-rows 250000
python build_graph.py
python -m uvicorn app:app --reload
