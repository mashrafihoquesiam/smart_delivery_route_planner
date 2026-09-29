# SmartRoute BD — পুরো Project Guide (বাংলা)

## একদম সহজ ভাষায় projectটা কী?

এই project দুইটা জিনিস একসাথে করবে:

**1) AI Model:** Logistic Regression train করে road/context risk predict করবে।

**2) A* Algorithm:** Dhaka-এর road graph-এর উপর route বের করবে। AI-এর risk prediction route-এর cost বাড়াবে/কমাবে।

অর্থাৎ:

`Dataset → Training → Model → Risk Prediction → A* → Smart Route`

---

## কেন model train করতে হবে?

কারণ তোমাদের project-এর AI অংশ হলো Logistic Regression classifier। Dataset-এর হাজার হাজার/লাখ লাখ row থেকে model শিখবে কোন ধরনের road/weather/time context বেশি risk-এর সাথে associated। Training শেষে `road_risk_model.joblib` তৈরি হবে। Application চালানোর সময় এই saved model-ই prediction করবে।

---

## কোন dataset?

**BDRoadRisk** public dataset, Bangladesh-এর Dhaka এবং Chittagong urban road context simulate করে। Dataset-এ 10 million synthetic traffic-event records এবং 23 features আছে। Label তিনটি: `No_Accident`, `Minor`, `Major`।

Public page:
https://data.mendeley.com/datasets/m33bsbsgx2

Dataset synthetic; তাই presentation-এ এটাকে real-time sensor data বলবে না।

---

## আমরা model-এ কোন columns দেব?

এই project-এ intentionally contextual/pre-incident ধরনের features রাখা হয়েছে:

- latitude
- longitude
- weather_condition
- road_surface
- junction_type
- light_condition
- time_of_day
- vehicle_type
- road_quality
- speed_limit_zone
- month
- road_class

Target:

`accident_severity`

আর route scoring-এর জন্য output mapping:

`No_Accident → Low`

`Minor → Medium`

`Major → High`

---

## Step 1 — Python environment

Mac:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Windows PowerShell:

```powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
```

---

## Step 2 — Dataset বসানো

Mendeley page থেকে Parquet archive download করো:

https://data.mendeley.com/datasets/m33bsbsgx2

Extract করে:

```text
data/bdroad_risk/
```

folder-এর ভিতরে `.parquet` files থাকতে হবে।

---

## Step 3 — Model train

প্রথমবার:

```bash
python train_model.py --data data/bdroad_risk --max-rows 250000
```

এটা public dataset থেকে সর্বোচ্চ 250,000 sampled rows নিয়ে training করবে। পুরো 10 million rows একসাথে RAM-এ তোলা হবে না।

শেষে:

```text
models/road_risk_model.joblib
models/model_metadata.json
```

তৈরি হবে।

---

## Step 4 — Model কীভাবে train হচ্ছে?

### Data cleaning
Missing values handle হয়।

### Encoding
Text values One-Hot Encoding হয়।

যেমন:

`weather_condition = Rain`

→ encoded numeric feature

### Scaling
Latitude/longitude/month/speed-limit-এর numeric columns StandardScaler-এর মাধ্যমে scale হয়।

### Train/Test split
Default:

`80% train + 20% test`

### Model

`LogisticRegression(class_weight="balanced")`

ব্যবহার করা হয়েছে।

### Evaluation

- Accuracy
- Weighted F1
- Precision
- Recall
- Confusion Matrix

সব terminal-এ দেখাবে।

---

## Step 5 — Dhaka road graph

```bash
python build_graph.py
```

এটা OpenStreetMap থেকে Dhaka-এর drivable road network OSMnx দিয়ে download করবে।

Output:

```text
data/dhaka_drive.graphml
```

---

## Step 6 — A* কীভাবে কাজ করবে?

A* প্রতিটি road edge-এর জন্য:

`edge cost = distance × risk multiplier`

Risk multiplier:

```text
Low = 1.0
Medium = 1.5
High = 2.5
```

এগুলো project-এর chosen weights।

Heuristic:

`straight-line distance → destination`

তাই search শুধু distance নয়, predicted risk-ও বিবেচনা করবে।

---

## Step 7 — Application run

```bash
python -m uvicorn app:app --reload
```

Browser:

http://127.0.0.1:8000

---

## Browser-এ কী হবে?

Start:

`Mirpur 10`

Destination:

`Dhanmondi`

Weather:

`Rain`

Vehicle:

`Motorcycle`

Hour:

`18`

তারপর:

**Find Smart Route**

Backend model দিয়ে road risk predict করবে। তারপর A* route বের করবে। Leaflet map-এ route দেখাবে।

---

## Full backend flow

```text
Browser
  ↓
POST /api/route
  ↓
FastAPI
  ↓
Nearest road nodes
  ↓
For each candidate edge
  ↓
Feature creation
  ↓
Saved Logistic Regression model
  ↓
Risk = Low / Medium / High
  ↓
Edge cost update
  ↓
Custom A*
  ↓
Route coordinates
  ↓
Browser map
```

---

## Project-এর main files

`train_model.py`
→ ML training

`build_graph.py`
→ Dhaka OSM road graph

`risk_model.py`
→ trained model load + prediction

`route_planner.py`
→ custom A*

`app.py`
→ FastAPI backend

`static/`
→ HTML/CSS/JS frontend

---

## Demo mode

Public dataset download না করলে software test করার জন্য:

```bash
python generate_demo_data.py --rows 5000
python train_model.py --data data/demo_training.csv --max-rows 5000
python build_graph.py
python -m uvicorn app:app --reload
```

Demo dataset synthetic। Final report-এর model result-এর জন্য public BDRoadRisk দিয়ে train করবে।

---

## Viva-তে বলবে

**Question: তোমাদের AI কোথায়?**

Answer:

“Our Logistic Regression model is trained on Bangladesh-specific road-risk data and predicts a risk class for the context of a road segment.”

**Question: A* কোথায়?**

Answer:

“The predicted risk is converted into a penalty and included in the edge cost. A* then searches for a route using the risk-weighted cost.”

**Question: কেন শুধু shortest path নয়?**

Answer:

“Because the shortest road may not be the best road under risky road or weather conditions. Our project adds a learned risk factor to route planning.”

---

## Important limitation

এটা **live traffic app নয়**। OSM road network হলো map/graph source এবং BDRoadRisk হলো synthetic training dataset। User যে weather/time/vehicle context দেয়, তার ভিত্তিতে ML risk score route planning-এ ব্যবহার করা হয়।

Future version-এ real traffic API / live GPS / IoT sensor data যোগ করা যাবে।
