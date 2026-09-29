# SmartRoute BD — AI-Based Smart Delivery Route Planner

A student-friendly AI + Graph Search project for Bangladesh urban delivery routing.

## What this project does

The project combines two parts:

1. **Machine Learning:** a multiclass Logistic Regression model is trained on the public **BDRoadRisk** dataset to classify road/traffic context into `Low`, `Medium`, or `High` risk.
2. **Graph Search:** a custom **A*** search uses OpenStreetMap road-network data for Dhaka and adds the ML risk as a penalty to each road segment. The result is a risk-aware delivery route.

> Important: BDRoadRisk is a **synthetic** dataset, not a real-time traffic sensor feed. Therefore this project should be presented as a **risk-aware route planner**, not as a live traffic prediction system.

## Project flow

```text
BDRoadRisk dataset
      ↓
Data cleaning + encoding
      ↓
Logistic Regression training
      ↓
road_risk_model.joblib
      ↓
Dhaka OpenStreetMap road graph
      ↓
For each road edge, build context features
      ↓
ML risk prediction: Low / Medium / High
      ↓
Risk-weighted edge cost
      ↓
Custom A* Search
      ↓
Recommended delivery route
```

## 1) Prerequisites

Recommended:

- macOS / Windows / Linux
- Python 3.11 or 3.12
- Internet connection
- 8 GB+ RAM recommended

The public BDRoadRisk dataset currently has 10 million synthetic records and a CSV plus Parquet distribution. The CSV is much larger; use the Parquet archive for the project when possible. Source: Mendeley Data, version 4.

Dataset page: https://data.mendeley.com/datasets/m33bsbsgx2

Dhaka road network is downloaded from OpenStreetMap through OSMnx. OpenStreetMap is used only as the routing graph source.

## 2) Create virtual environment

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Windows PowerShell

```powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 3) Get the public Bangladesh training dataset

Open:

https://data.mendeley.com/datasets/m33bsbsgx2

Download the **Parquet archive** (`traffic_data_parquet.zip`) or the CSV if you have enough storage.

For easiest setup:

```text
smart_delivery_route_planner/
└── data/
    └── bdroad_risk/
        ├── road_class=motorway/
        ├── road_class=primary/
        ├── road_class=secondary/
        └── road_class=residential/
```

The exact extracted layout may differ slightly. The training script accepts any folder containing Parquet files.

## 4) Train the model

### Recommended first run

Train on 250,000 sampled rows so the project is practical on a student laptop:

```bash
python train_model.py --data data/bdroad_risk --max-rows 250000
```

The script creates:

```text
models/road_risk_model.joblib
models/model_metadata.json
```

### More training data

```bash
python train_model.py --data data/bdroad_risk --max-rows 500000
```

or, if you have enough time/RAM:

```bash
python train_model.py --data data/bdroad_risk --max-rows 1000000
```

The model is trained from public Bangladesh-specific data; the `--max-rows` value controls how much of the public dataset is sampled for the student project.

## 5) Build the Dhaka road graph

Run:

```bash
python build_graph.py
```

This downloads the drivable street network of Dhaka from OpenStreetMap using OSMnx and stores:

```text
data/dhaka_drive.graphml
```

The first download needs internet access. Later runs reuse the saved graph.

## 6) Run the project

```bash
python -m uvicorn app:app --reload
```

Open:

http://127.0.0.1:8000

## Admin Console

The admin dashboard uses the same login page as rider accounts. Sign in from the shared page; the backend identifies the account role and routes administrator sessions to the protected dashboard. Build the frontend with `cd frontend && npm install && npm run build`. The shared login and protected dashboard are available at:

http://127.0.0.1:8000/

For frontend development, run the Vite server with `cd frontend && npm run dev` and open `http://127.0.0.1:5173/`. The `/admin` path is reserved for an authenticated admin dashboard session and returns to the shared login when signed out.

Create additional administrator accounts with the password-prompted bootstrap utility:

```bash
python create_admin.py --username your-admin-name --email admin@example.com
```

Admin accounts, hashed credentials, sessions, verification decisions, account controls, and audit entries are stored in separate additive tables. Rider identity uploads remain in private per-user storage; do not expose or commit those files.

## 7) How to use the web app

Choose a start and destination from the predefined Dhaka locations, then press **Find Smart Route**.

The backend will:

1. find the nearest graph nodes;
2. inspect each candidate road edge;
3. create ML features for the current route context;
4. call the trained Logistic Regression model;
5. convert the prediction to a risk multiplier;
6. run A* using the risk-weighted edge cost;
7. return distance, risk summary, and route coordinates;
8. draw the route on a Leaflet map.

## 8) Risk settings used by this project

The default mapping is:

```text
Low    → 1.0
Medium → 1.5
High   → 2.5
```

Edge cost:

```text
edge_cost = road_distance_meters × risk_multiplier
```

A* heuristic:

```text
h(n) = straight-line distance from n to destination
```

Because every risk multiplier is >= 1.0, this keeps the heuristic safe for the project's intended cost model.

These multipliers are **project design parameters**, not measured Bangladesh traffic costs.

## 9) Quick demo without the public dataset

If you only want to verify the code before downloading the large public dataset:

```bash
python generate_demo_data.py --rows 5000
python train_model.py --data data/demo_training.csv --max-rows 5000
python build_graph.py
python -m uvicorn app:app --reload
```

The demo dataset is synthetic and is only for software testing. For your final report/presentation, train the model on the public BDRoadRisk dataset.

## 10) Suggested project presentation wording

### Problem
Delivery companies need routes that are not only short but also safer under changing road/context conditions.

### AI idea
Train a Logistic Regression classifier on Bangladesh-specific road-risk data.

### Search idea
Use A* on an OpenStreetMap road graph.

### Integration
Use the ML risk prediction as a penalty in A* edge cost.

### Final output
A risk-aware delivery route for Dhaka.

## 11) Important academic limitation

The BDRoadRisk data is synthetic. Some published features are generated conditionally on accident severity. For this project, the training feature list intentionally uses a smaller set of contextual/pre-incident fields, excluding the target and obvious post-incident variables such as speed, acceleration and reaction time. This reduces direct target leakage and makes the model more appropriate for route-context scoring.

## 12) Recommended report sections

1. Introduction
2. Problem Statement
3. Objectives
4. Dataset Description
5. Data Preprocessing
6. Logistic Regression Model
7. Model Evaluation
8. OpenStreetMap Road Graph
9. A* Algorithm and Heuristic
10. ML + A* Integration
11. System Architecture
12. Implementation
13. Results
14. Limitations
15. Future Work
16. Conclusion

## 13) Main files

```text
train_model.py       → train ML model
build_graph.py       → download and save Dhaka road graph
route_planner.py     → custom A* + ML risk integration
risk_model.py        → load trained model and predict risk
app.py               → FastAPI backend + web app
static/              → frontend
```
