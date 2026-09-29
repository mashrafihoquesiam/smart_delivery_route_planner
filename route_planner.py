from __future__ import annotations

import math
import itertools
from datetime import datetime
from pathlib import Path
from typing import Any

import requests

import networkx as nx
import osmnx as ox

from risk_model import RiskModel

GRAPH_PATH = Path("data/dhaka_drive.graphml")

PLACES = {
    "Mirpur 10": (23.8060, 90.3683),
    "Uttara": (23.8759, 90.3795),
    "Banani": (23.7937, 90.4066),
    "Mohakhali": (23.7770, 90.3995),
    "Farmgate": (23.7577, 90.3897),
    "Dhanmondi": (23.7465, 90.3760),
    "Mohammadpur": (23.7660, 90.3580),
    "Motijheel": (23.7330, 90.4170),
}

RISK_WEIGHT = {"Low": 1.0, "Medium": 1.5, "High": 2.5}


HIGHWAY_TO_CLASS = {
    "motorway": "motorway",
    "motorway_link": "motorway",
    "trunk": "primary",
    "trunk_link": "primary",
    "primary": "primary",
    "primary_link": "primary",
    "secondary": "secondary",
    "secondary_link": "secondary",
    "tertiary": "secondary",
    "tertiary_link": "secondary",
    "residential": "residential",
    "living_street": "residential",
    "service": "residential",
}



def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6_371_000 * 2 * math.asin(math.sqrt(h))


def first_value(value: Any, default: Any = None) -> Any:
    if isinstance(value, list):
        return value[0] if value else default
    return value if value is not None else default


def infer_road_class(edge: dict[str, Any]) -> str:
    hw = first_value(edge.get("highway"), "residential")
    return HIGHWAY_TO_CLASS.get(str(hw), "residential")


def infer_speed_limit(road_class: str, edge: dict[str, Any]) -> int:
    maxspeed = first_value(edge.get("maxspeed"))
    if maxspeed:
        try:
            text = str(maxspeed).lower().replace(" km/h", "").strip()
            return int(float(text))
        except ValueError:
            pass
    return {"motorway": 80, "primary": 50, "secondary": 40, "residential": 30}.get(road_class, 30)


def context_to_features(
    latitude: float,
    longitude: float,
    road_class: str,
    edge: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    hour = int(context.get("hour", datetime.now().hour))
    weather = str(context.get("weather", "Clear"))
    month = int(context.get("month", datetime.now().month))
    vehicle_type = str(context.get("vehicle_type", "Car"))

    if 6 <= hour < 12:
        tod = "Morning"
    elif 12 <= hour < 17:
        tod = "Afternoon"
    elif 17 <= hour < 22:
        tod = "Evening"
    else:
        tod = "Night"

    if tod in {"Morning", "Afternoon"}:
        light = "Daylight"
    else:
        light = "Dark_Lit"

    if weather in {"Rain", "Storm"}:
        surface = "Wet"
    elif weather == "Fog":
        surface = "Dry"
    else:
        surface = "Dry"

    road_quality = {
        "motorway": "Good",
        "primary": "Good",
        "secondary": "Fair",
        "residential": "Fair",
    }.get(road_class, "Fair")

    traffic_base = {
        "motorway": 35,
        "primary": 65,
        "secondary": 55,
        "residential": 35,
    }.get(road_class, 40)
    if tod in {"Morning", "Evening"}:
        traffic_base += 20
    if weather in {"Rain", "Storm"}:
        traffic_base += 15

    # These are contextual proxy values for the student project. They are not live sensor readings.
    return {
        "latitude": latitude,
        "longitude": longitude,
        "weather_condition": weather,
        "road_surface": surface,
        "junction_type": "None",
        "light_condition": light,
        "time_of_day": tod,
        "vehicle_type": vehicle_type,
        "road_quality": road_quality,
        "speed_limit_zone": infer_speed_limit(road_class, edge),
        "month": month,
        "road_class": road_class,
    }


def choose_edge(G: nx.MultiDiGraph, u: Any, v: Any) -> dict[str, Any]:
    data = G.get_edge_data(u, v)
    if not data:
        raise KeyError(f"No edge between {u} and {v}")
    best = min(data.values(), key=lambda e: float(e.get("length", 1.0)))
    return best


def astar_route(G: nx.MultiDiGraph, start: Any, goal: Any, risk_model: RiskModel, context: dict[str, Any]) -> tuple[list[Any], float, list[dict[str, Any]]]:
    goal_lat = float(G.nodes[goal]["y"])
    goal_lon = float(G.nodes[goal]["x"])

    open_heap: list[tuple[float, Any]] = [(0.0, start)]
    g_score: dict[Any, float] = {start: 0.0}
    came_from: dict[Any, Any] = {}
    edge_meta: dict[Any, dict[str, Any]] = {}
    visited = set()

    while open_heap:
        _, current = min(open_heap, key=lambda item: item[0])
        open_heap.remove((_, current))
        if current in visited:
            continue
        visited.add(current)

        if current == goal:
            nodes = [goal]
            while nodes[-1] != start:
                nodes.append(came_from[nodes[-1]])
            nodes.reverse()
            edge_info = []
            for node in nodes[1:]:
                edge_info.append(edge_meta[node])
            return nodes, g_score[goal], edge_info

        current_xy = (float(G.nodes[current]["y"]), float(G.nodes[current]["x"]))

        for neighbor in G.successors(current):
            edge = choose_edge(G, current, neighbor)
            distance = max(float(edge.get("length", 1.0)), 1.0)
            neighbor_xy = (float(G.nodes[neighbor]["y"]), float(G.nodes[neighbor]["x"]))
            midpoint = ((current_xy[0] + neighbor_xy[0]) / 2, (current_xy[1] + neighbor_xy[1]) / 2)
            road_class = infer_road_class(edge)
            features = context_to_features(midpoint[0], midpoint[1], road_class, edge, context)
            prediction = risk_model.predict(features)
            risk = prediction["risk"]
            weight = RISK_WEIGHT.get(risk, 1.0)
            step_cost = distance * weight
            tentative = g_score[current] + step_cost

            if tentative < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative
                heuristic = haversine_m(neighbor_xy, (goal_lat, goal_lon))
                open_heap.append((tentative + heuristic, neighbor))
                edge_meta[neighbor] = {
                    "distance_m": distance,
                    "risk": risk,
                    "weight": weight,
                    "prediction": prediction,
                    "road_class": road_class,
                }

    raise RuntimeError("No route found between the selected locations.")


class RoutePlanner:
    def __init__(self, graph_path: Path = GRAPH_PATH):
        if not graph_path.exists():
            raise FileNotFoundError(f"Graph not found: {graph_path}. Run build_graph.py first.")
        self.graph = ox.load_graphml(graph_path)
        self.risk_model = RiskModel()
        self.node_list = list(self.graph.nodes)

    def nearest_node(self, latitude: float, longitude: float) -> Any:
        return ox.distance.nearest_nodes(self.graph, X=longitude, Y=latitude)

    def _road_route(self, place_names: list[str], context: dict[str, Any]) -> dict[str, Any] | None:
        coordinates = [PLACES[name] for name in place_names]
        coordinate_text = ";".join(f"{longitude},{latitude}" for latitude, longitude in coordinates)
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "false",
            "alternatives": "true",
        }
        try:
            response = requests.get(
                f"https://router.project-osrm.org/route/v1/driving/{coordinate_text}",
                params=params,
                timeout=20,
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("code") != "Ok" or not payload.get("routes"):
                return None
            routes = payload["routes"]
            primary = routes[0]
            alternatives = [
                {
                    "distance_km": round(route["distance"] / 1000, 2),
                    "duration_min": round(route["duration"] / 60),
                    "path_points": [[point[1], point[0]] for point in route["geometry"]["coordinates"]],
                }
                for route in routes[1:3]
            ]
            return {
                "path_points": [[point[1], point[0]] for point in primary["geometry"]["coordinates"]],
                "distance_km": round(primary["distance"] / 1000, 2),
                "duration_min": round(primary["duration"] / 60),
                "alternatives": alternatives,
            }
        except (requests.RequestException, ValueError, KeyError):
            return None

    def _stop_order(self, start_name: str, destination_name: str, stops: list[str], context: dict[str, Any]) -> list[str]:
        if not stops or len(stops) > 6:
            return [start_name, *stops, destination_name]
        if not context.get("optimize_stops", True):
            return [start_name, *stops, destination_name]
        remaining = set(stops)
        ordered = [start_name]
        while remaining:
            current = PLACES[ordered[-1]]
            next_stop = min(remaining, key=lambda name: haversine_m(current, PLACES[name]))
            ordered.append(next_stop)
            remaining.remove(next_stop)
        ordered.append(destination_name)
        return ordered

    def route(self, start_name: str, destination_name: str, context: dict[str, Any], stops: list[str] | None = None) -> dict[str, Any]:
        start = PLACES[start_name]
        dest = PLACES[destination_name]
        start_node = self.nearest_node(*start)
        goal_node = self.nearest_node(*dest)
        nodes, weighted_cost, edge_info = astar_route(self.graph, start_node, goal_node, self.risk_model, context)

        place_names = self._stop_order(start_name, destination_name, stops or [], context)
        road_route = self._road_route(place_names, context)
        coords = road_route["path_points"] if road_route else [[float(self.graph.nodes[n]["y"]), float(self.graph.nodes[n]["x"])] for n in nodes]
        real_distance = sum(item["distance_m"] for item in edge_info)
        risks = [item["risk"] for item in edge_info]
        counts = {r: risks.count(r) for r in ["Low", "Medium", "High"]}
        if counts["High"] > 0:
            overall = "High"
        elif counts["Medium"] > 0:
            overall = "Medium"
        else:
            overall = "Low"

        return {
            "start": start_name,
            "destination": destination_name,
            "start_coordinate": {"lat": start[0], "lon": start[1]},
            "destination_coordinate": {"lat": dest[0], "lon": dest[1]},
            "distance_km": road_route["distance_km"] if road_route else round(real_distance / 1000, 2),
            "duration_min": road_route["duration_min"] if road_route else round(real_distance / 1000 * 3, 1),
            "risk_weighted_cost": round(weighted_cost, 2),
            "overall_risk": overall,
            "risk_edge_counts": counts,
            "path_points": coords,
            "stops": place_names[1:-1],
            "alternatives": road_route["alternatives"] if road_route else [],
            "route_source": "OpenStreetMap road routing" if road_route else "Local fallback graph",
            "context": context,
        }
