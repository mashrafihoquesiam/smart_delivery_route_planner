from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

CATEGORIES = {
    "weather_condition": ["Clear", "Rain", "Fog", "Storm"],
    "road_surface": ["Dry", "Wet", "Icy", "Damaged"],
    "junction_type": ["None", "T-Junction", "Crossroad", "Roundabout"],
    "light_condition": ["Daylight", "Dusk_Dawn", "Dark_Lit", "Dark_Unlit"],
    "time_of_day": ["Morning", "Afternoon", "Evening", "Night"],
    "vehicle_type": ["Car", "Truck", "Motorcycle", "Bus", "Van"],
    "road_quality": ["Poor", "Fair", "Good"],
    "speed_limit_zone": [30, 50, 80, 100, 120],
    "road_class": ["motorway", "primary", "secondary", "residential"],
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=5000)
    parser.add_argument("--output", default="data/demo_training.csv")
    args = parser.parse_args()

    n = args.rows
    weather = RNG.choice(CATEGORIES["weather_condition"], n, p=[0.68, 0.20, 0.08, 0.04])
    road_surface = np.where(
        np.isin(weather, ["Rain", "Storm"]),
        RNG.choice(["Wet", "Damaged", "Dry"], n, p=[0.68, 0.12, 0.20]),
        RNG.choice(CATEGORIES["road_surface"], n, p=[0.78, 0.08, 0.08, 0.06]),
    )
    road_quality = RNG.choice(CATEGORIES["road_quality"], n, p=[0.20, 0.45, 0.35])
    road_class = RNG.choice(CATEGORIES["road_class"], n, p=[0.05, 0.35, 0.35, 0.25])
    tod = RNG.choice(CATEGORIES["time_of_day"], n, p=[0.28, 0.28, 0.25, 0.19])
    junction = RNG.choice(CATEGORIES["junction_type"], n, p=[0.48, 0.20, 0.25, 0.07])
    light = np.where(np.isin(tod, ["Morning", "Afternoon"]), "Daylight", RNG.choice(["Dusk_Dawn", "Dark_Lit", "Dark_Unlit"], n, p=[0.25, 0.60, 0.15]))
    vehicle = RNG.choice(CATEGORIES["vehicle_type"], n, p=[0.40, 0.12, 0.28, 0.08, 0.12])
    speed_limit = RNG.choice(CATEGORIES["speed_limit_zone"], n, p=[0.18, 0.52, 0.25, 0.04, 0.01])
    month = RNG.integers(1, 13, n)
    latitude = RNG.uniform(23.70, 23.90, n)
    longitude = RNG.uniform(90.30, 90.55, n)

    risk = np.zeros(n)
    risk += np.isin(weather, ["Rain", "Fog", "Storm"]) * 0.8
    risk += np.isin(road_surface, ["Wet", "Damaged"]) * 0.7
    risk += (road_quality == "Poor") * 0.8
    risk += (road_quality == "Fair") * 0.25
    risk += np.isin(junction, ["Crossroad", "Roundabout"]) * 0.35
    risk += np.isin(tod, ["Evening", "Night"]) * 0.35
    risk += np.isin(light, ["Dark_Unlit"]) * 0.55
    risk += np.isin(vehicle, ["Truck", "Bus", "Motorcycle"]) * 0.20
    risk += np.isin(road_class, ["primary", "motorway"]) * 0.10
    risk += (speed_limit >= 80) * 0.25
    risk += RNG.normal(0, 0.25, n)

    target = np.where(risk < 0.7, "No_Accident", np.where(risk < 1.7, "Minor", "Major"))

    df = pd.DataFrame(
        {
            "latitude": latitude,
            "longitude": longitude,
            "weather_condition": weather,
            "road_surface": road_surface,
            "junction_type": junction,
            "light_condition": light,
            "time_of_day": tod,
            "vehicle_type": vehicle,
            "road_quality": road_quality,
            "speed_limit_zone": speed_limit,
            "month": month,
            "road_class": road_class,
            "accident_severity": target,
        }
    )

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Saved {len(df):,} demo rows to {out}")


if __name__ == "__main__":
    main()
