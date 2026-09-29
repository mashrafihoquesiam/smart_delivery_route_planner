from __future__ import annotations

from pathlib import Path
from math import asin, cos, radians, sin, sqrt

import networkx as nx
import osmnx as ox

from route_planner import PLACES

GRAPH_PATH = Path("data/dhaka_drive.graphml")
DHAKA_BBOX = (90.33, 23.70, 90.50, 23.90)
OVERPASS_URL = "https://overpass.kumi.systems/api"


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(radians, a)
    lat2, lon2 = map(radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 6_371_000 * 2 * asin(sqrt(value))


def build_offline_graph() -> nx.MultiDiGraph:
    graph = nx.MultiDiGraph(name="SmartRoute BD offline delivery corridor")
    graph.graph["crs"] = "EPSG:4326"
    for index, (name, (latitude, longitude)) in enumerate(PLACES.items()):
        graph.add_node(str(index), x=longitude, y=latitude, name=name)

    place_items = list(PLACES.items())
    for source_index, (_, source) in enumerate(place_items):
        for target_index, (_, target) in enumerate(place_items):
            if source_index == target_index:
                continue
            graph.add_edge(
                str(source_index),
                str(target_index),
                length=round(haversine_m(source, target), 2),
                highway="primary",
                maxspeed="50",
            )
    return graph


def main() -> None:
    GRAPH_PATH.parent.mkdir(parents=True, exist_ok=True)
    if GRAPH_PATH.exists():
        print(f"Graph already exists: {GRAPH_PATH}")
        return

    print("Downloading the Dhaka delivery corridor from OpenStreetMap...")
    ox.settings.use_cache = True
    ox.settings.log_console = True
    ox.settings.overpass_url = OVERPASS_URL
    ox.settings.requests_timeout = 90
    try:
        graph = ox.graph_from_bbox(DHAKA_BBOX, network_type="drive", simplify=True)
        print("Downloaded OpenStreetMap road graph.")
    except Exception as exc:
        print(f"Warning: OpenStreetMap download failed: {exc}")
        print("Building an offline delivery graph from the configured Dhaka locations...")
        graph = build_offline_graph()

    ox.save_graphml(graph, GRAPH_PATH)
    print(f"Saved graph: {GRAPH_PATH}")
    print(f"Nodes: {len(graph.nodes):,} | Edges: {len(graph.edges):,}")


if __name__ == "__main__":
    main()
