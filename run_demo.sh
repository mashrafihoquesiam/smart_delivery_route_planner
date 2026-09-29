#!/usr/bin/env bash
set -e
python generate_demo_data.py --rows 5000
python train_model.py --data data/demo_training.csv --max-rows 5000
python build_graph.py
python -m uvicorn app:app --reload
