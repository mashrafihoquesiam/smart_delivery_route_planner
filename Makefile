install:
	python3 -m venv .venv
	. .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt

demo-data:
	python generate_demo_data.py --rows 5000

train-demo:
	python train_model.py --data data/demo_training.csv --max-rows 5000

train-public:
	python train_model.py --data data/bdroad_risk --max-rows 250000

graph:
	python build_graph.py

run:
	python -m uvicorn app:app --reload
