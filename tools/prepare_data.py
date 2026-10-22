#!/usr/bin/env python3
"""Prepare verified local display copies from the frozen research handoff.

Run with the existing Python 3.13 GIS environment. Source files and research
scripts are never modified or executed. Coordinates change to EPSG:4326 only
in display copies; complete geometry, holes, original fields, IDs, empty CSV
cells and research-state axes are retained. No source geometry is repaired or
removed. A separately documented navigation point layer selects one existing
classification variant. ``--check-only`` independently checks an existing build.
"""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import logging
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import pyproj
import shapely
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import transform

SCHEMA_VERSION = "0.1.local-display-copy"
SOURCE_EPSG = 32648
DISPLAY_EPSG = 4326
ROUNDTRIP_TOLERANCE_M = 1e-6
REGIONAL_ROADS_SOURCE = "02_不同绿色空间的相互作用/宏观研究/数据核查/二环边界核对_2026-10-02/chengdu_highways_210101.geojson"
REGIONAL_ROADS_SOURCE_SHA256 = "56f276ba8b8c69e52a0f70ceb7312d7900394da1dff41b5d1598b6fc163b18fb"
LOG = logging.getLogger("prepare_display_data")
JSON = dict[str, Any]
MICRO_ALIASES = {
    "core": "core",
    "context": "context",
    "buildings_uncut": "buildings",
    "vegetation_core": "vegetation",
    "source_classes_context": "source_classes_context",
    "overlap_review_core": "overlap_review_core",
    "surface_review_core": "surface_review_core",
    "receptor_candidates": "receptors",
}


def digest(path: Path) -> str:
    """Hash a file in bounded chunks without changing it."""
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def read_json(path: Path) -> JSON:
    """Read a UTF-8 JSON object."""
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def write_json(path: Path, value: JSON) -> None:
    """Atomically write deterministic, strict JSON, avoiding unchanged rewrites."""
    payload = (json.dumps(value, ensure_ascii=False, allow_nan=False,
                          separators=(",", ":")) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == payload:
        return
    temporary = path.with_name(path.name + ".prepare.tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)


def write_original_bytes(path: Path, source: Path) -> None:
    """Copy a navigation source byte for byte without changing its JSON."""
    payload = source.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == payload:
        return
    temporary = path.with_name(path.name + ".prepare.tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)


def normalized(value: Any) -> Any:
    """Convert scalar missing values to JSON null without altering valid values."""
    if value is None or pd.isna(value):
        return None
    if isinstance(value, np.generic):
        return value.item()
    return value


def artifacts_by_id(package: JSON) -> dict[str, JSON]:
    """Index the complete source inventory and reject duplicate identities."""
    result = {entry["artifact_id"]: entry for entry in package["artifacts"]}
    if len(result) != package["artifact_count"] or len(result) != 24:
        raise ValueError("Expected 24 unique registered source artifacts")
    return result


def source_path(project_root: Path, artifact: JSON) -> Path:
    """Resolve a registered relative source without trusting an absolute path."""
    path = (project_root / artifact["source_project_relative_path"]).resolve()
    if not path.is_relative_to(project_root.resolve()):
        raise ValueError("Registered source escapes the project root")
    return path


def check_sources(project_root: Path, artifacts: dict[str, JSON],
                  accept_platform_contract_update: bool) -> tuple[dict[str, str], list[JSON]]:
    """Enforce source hashes, with one explicit authorized platform-spec exception."""
    checked, changes = {}, []
    for artifact_id, entry in artifacts.items():
        path = source_path(project_root, entry)
        if not path.is_file():
            raise FileNotFoundError(f"Missing source: {artifact_id}: {path}")
        current = digest(path)
        if current != entry["sha256"]:
            if accept_platform_contract_update and artifact_id == "product_contract":
                changes.append({"artifact_id": artifact_id, "original_sha256": entry["sha256"],
                                "frozen_sha256": entry["sha256"],
                                "live_sha256": current, "source_path": str(path),
                                "reason": "authorised_current_platform_spec_sync",
                                "accepted_for": "platform_contract_reference_only_not_scientific_rebuild"})
            else:
                raise ValueError(f"Source version changed for {artifact_id}; "
                                 "request an updated root handoff before rebuilding")
        checked[artifact_id] = current
    return checked, changes


def load_layer(project_root: Path, artifact: JSON, layer: JSON) -> gpd.GeoDataFrame:
    """Read an entire source layer, preserving native feature IDs and geometry."""
    frame = gpd.read_file(source_path(project_root, artifact), layer=layer["name"],
                          engine="pyogrio", fid_as_index=True).sort_index()
    if frame.crs is None or frame.crs.to_epsg() != SOURCE_EPSG:
        raise ValueError(f"Unknown/unexpected CRS: {artifact['artifact_id']}/{layer['name']}")
    if len(frame) != layer["row_count"] or not frame.index.is_unique:
        raise ValueError(f"Count/feature-ID mismatch: {layer['name']}")
    if frame.geometry.isna().any() or frame.geometry.is_empty.any() or not frame.geometry.is_valid.all():
        raise ValueError(f"Invalid/empty geometry; source requires review: {layer['name']}")
    if any(str(column).startswith("__") for column in frame.columns):
        raise ValueError("Source uses reserved display provenance field prefix")
    return frame


def collection(frame: gpd.GeoDataFrame, artifact_id: str, layer_name: str,
               source_hash: str, *, derived: bool = False) -> JSON:
    """Export full precision lon/lat geometry with unchanged source properties."""
    features = []
    displayed = frame.to_crs(epsg=DISPLAY_EPSG)
    for fid, row in displayed.iterrows():
        properties = {column: normalized(row[column]) for column in displayed.columns
                      if column != displayed.geometry.name}
        properties.update({"__source_fid": int(fid), "__source_layer": layer_name,
                           "__artifact_id": artifact_id})
        features.append({"type": "Feature", "id": f"{artifact_id}:{layer_name}:{fid}",
                         "properties": properties, "geometry": mapping(row.geometry)})
    return {
        "type": "FeatureCollection", "features": features,
        "bbox": displayed.total_bounds.tolist(),
        "metadata": {"schema_version": SCHEMA_VERSION, "artifact_id": artifact_id,
                     "source_layer": layer_name, "source_sha256": source_hash,
                     "source_crs": f"EPSG:{SOURCE_EPSG}", "display_crs": "EPSG:4326",
                     "coordinate_order": "longitude,latitude", "feature_count": len(frame),
                     "geometry_policy": "complete_unclipped_no_repair_no_simplification",
                     "derived_geometry": derived, "science_validation": "candidate",
                     "height_accuracy_verified": False},
    }


def read_table(project_root: Path, artifact: JSON, site_id: str) -> JSON:
    """Parse CSV with original string/empty-cell values and explicit row accounting.

    Large macro files are streamed once; only the selected site's rows are
    included. This is O(n), never a model-input selection or research rerun.
    """
    artifact_id = artifact["artifact_id"]
    all_rows = artifact_id not in {"macro_joined", "macro_building_support", "macro_edges"}
    rows, keys, grids, variants = [], set(), set(), set()
    self_loops, total = 0, 0
    with source_path(project_root, artifact).open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = reader.fieldnames or []
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Malformed CSV record: {artifact_id}")
            total += 1
            if artifact_id == "macro_joined":
                key = (row["grid_id"], row["variant"])
                if key in keys:
                    raise ValueError("Duplicate macro grid/variant row")
                keys.add(key)
                grids.add(row["grid_id"])
                variants.add(row["variant"])
            if artifact_id == "macro_edges":
                key = (row["source_grid_id"], row["target_grid_id"])
                if key in keys:
                    raise ValueError("Duplicate directed macro edge")
                keys.add(key)
                self_loops += row["is_self_loop"] == "True"
            is_target = row.get("grid_id") == site_id or row.get("target_grid_id") == site_id
            if all_rows or is_target:
                rows.append(row)
    if total != artifact["row_count"]:
        raise ValueError(f"CSV row count differs from inventory: {artifact_id}")
    if artifact_id == "macro_joined":
        rows.sort(key=lambda item: item["variant"])
    return {"artifact_id": artifact_id, "source_sha256": artifact["sha256"],
            "fields": fields, "rows": rows, "source_row_count": total,
            "display_row_count": len(rows), "selected_site_id": None if all_rows else site_id,
            "value_encoding": "original_utf8_strings_empty_cell_is_empty_string_not_zero",
            "independent_grid_count": len(grids) if grids else None,
            "variants": sorted(variants), "self_loop_count": self_loops if artifact_id == "macro_edges" else None}


def derive_context(nodes: gpd.GeoDataFrame, scenario: JSON, source_hash: str) -> tuple[JSON, JSON]:
    """Create the receipt's 300m display extent and retain its nine source nodes."""
    scope = next(item for item in scenario["scope_registry"]
                 if item["support_id"] == "macro_neighborhood_300")
    region = box(*scope["bounds_m"])
    frame = gpd.GeoDataFrame({"support_id": [scope["support_id"]],
                              "target_grid_id": [scenario["site_id"]],
                              "role": [scope["role"]], "width_m": [scope["width_m"]],
                              "not_final_solver_domain": [True],
                              "derivation": ["rectangle_from_handoff_scope_bounds_not_research_solver_domain"]},
                             geometry=[region], crs=f"EPSG:{SOURCE_EPSG}")
    context = collection(frame, "macro_nodes", "derived_macro_neighborhood_300", source_hash, derived=True)
    neighborhood = nodes[nodes.geometry.covered_by(region)]
    if len(neighborhood) != 9 or scenario["site_id"] not in set(neighborhood["grid_id"]):
        raise ValueError("300m extent does not contain nine complete source nodes and target")
    return context, collection(neighborhood, "macro_nodes", "candidate_nodes", source_hash)


def derive_parts(buildings: gpd.GeoDataFrame, source_hash: str) -> tuple[JSON, gpd.GeoDataFrame]:
    """Explode multipart footprints for display without inventing building identities."""
    rows, geometries = [], []
    for fid, row in buildings.iterrows():
        parts = list(row.geometry.geoms) if row.geometry.geom_type == "MultiPolygon" else [row.geometry]
        for part_index, geometry in enumerate(parts, start=1):
            properties = {key: normalized(row[key]) for key in buildings.columns if key != "geometry"}
            properties.update({"__parent_source_fid": int(fid), "__part_index": part_index,
                               "__source_building_id": normalized(row["merged_id"]),
                               "__display_working_height_m": normalized(row["Height_effective_working_m"]),
                               "__height_accuracy_verified": False,
                               "__identity_role": "geometry_part_not_independent_building"})
            rows.append(properties)
            geometries.append(geometry)
    frame = gpd.GeoDataFrame(rows, geometry=geometries, crs=buildings.crs)
    result = collection(frame, "micro_scene", "derived_building_parts", source_hash, derived=True)
    for feature in result["features"]:
        props = feature["properties"]
        feature["id"] = f"micro_scene:building:{props['merged_id']}:part:{props['__part_index']}"
        props["__source_fid"] = props["__parent_source_fid"]
        props["__source_layer"] = "buildings_uncut"
    result["metadata"].update({"source_object_count": len(buildings), "part_count": len(frame),
                               "derivation": "original_multipolygon_parts_without_clipping_or_repair"})
    return result, frame


def derive_regional_green_points(project_root: Path, nodes: gpd.GeoDataFrame,
                                 artifacts: dict[str, JSON], field_roles: JSON) -> tuple[JSON, gpd.GeoDataFrame]:
    """Use frozen c4_min0 G02 values at source node centers for navigation only.

    G02 is the retained class-2 plus class-3 projected area / 10,000m², hence
    a dimensionless fraction. filtered_green_ratio means removed green and is
    preserved as such. The referenced research code is read, never executed.
    """
    variant = "c4_min0"
    selected_fields = ["grid_id", "variant", "connectivity", "min_source_area_m2",
                       "G02", "G03", "G04", "filtered_green_ratio", "classified_ratio",
                       "filter_decision_known_ratio", "green_trial_status",
                       "formal_training_input_accepted", "formal_training_label_accepted"]
    roles = field_roles["column_roles"]
    if any(roles.get(key) != "green_or_surface_candidate_definition_not_frozen"
           for key in ["G02", "G03", "G04"]):
        raise ValueError("Green classification role is not the recorded candidate definition")
    joined_path = source_path(project_root, artifacts["macro_joined"])
    definition_path = joined_path.parent / "绿地" / "compute_green_trials.py"
    definition_text = definition_path.read_text(encoding="utf-8")
    anchors = {
        "cell_area": "CELL_AREA = 10000.0",
        "green_classes": "green = np.isin(classes,[2,3])",
        "retained_area": "green_area=float(areas[mask].sum())",
        "G02_G03": "'G02':green_area/CELL_AREA,'G03':float(areas[mask&(own_classes==2)].sum()/CELL_AREA)",
        "G04": "'G04':float(areas[mask&(own_classes==3)].sum()/CELL_AREA)",
        "removed_green": "'filtered_green_ratio':float(base.iloc[idx].G02-green_area/CELL_AREA)",
        "identity": "np.allclose(reopened.G02,reopened.G03+reopened.G04",
    }
    lines = definition_text.splitlines()
    anchor_lines = {}
    for key, anchor in anchors.items():
        matched = [index for index, line in enumerate(lines, 1) if anchor in line]
        if len(matched) != 1:
            raise ValueError(f"Unconfirmed green classification definition: {key}")
        anchor_lines[key] = matched[0]
    if nodes["grid_id"].duplicated().any():
        raise ValueError("Navigation node grid IDs are not unique")
    node_index = {str(row["grid_id"]): (fid, row) for fid, row in nodes.iterrows()}
    rows, geometries, seen = [], [], set()
    excluded = Counter()
    source_variant_rows = 0
    with joined_path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not set(selected_fields).issubset(reader.fieldnames or []):
            raise ValueError("Navigation classification fields missing from registered CSV")
        for record in reader:
            if record.get("variant") != variant:
                continue
            source_variant_rows += 1
            grid_id = record["grid_id"]
            if grid_id in seen or grid_id not in node_index:
                raise ValueError("c4_min0 grid identity is duplicated or has no source node")
            seen.add(grid_id)
            if record["connectivity"] != "4" or float(record["min_source_area_m2"]) != 0:
                raise ValueError("c4_min0 row does not retain its declared configuration")
            try:
                fraction = float(record["G02"])
            except ValueError:
                excluded["missing_or_non_numeric_G02"] += 1
                continue
            if not math.isfinite(fraction):
                excluded["nonfinite_G02"] += 1
                continue
            if not 0 <= fraction <= 1:
                excluded["outside_fraction_range"] += 1
                continue
            if fraction == 0:
                excluded["zero_retained_green_fraction"] += 1
                continue
            class2, class3, removed = (float(record[key]) for key in ["G03", "G04", "filtered_green_ratio"])
            if (not all(math.isfinite(value) and 0 <= value <= 1 for value in [class2, class3, removed])
                    or abs(fraction - class2 - class3) > 1e-7):
                raise ValueError("Selected classification violates its recorded fractional identity")
            fid, node = node_index[grid_id]
            easting, northing = float(node["center_e_m"]), float(node["center_n_m"])
            if not math.isfinite(easting) or not math.isfinite(northing):
                raise ValueError("Source node center is not a finite metric coordinate")
            properties = {key: record[key] for key in selected_fields}
            properties.update({"center_e_m": normalized(node["center_e_m"]),
                               "center_n_m": normalized(node["center_n_m"]),
                               "__source_node_fid": int(fid),
                               "__source_joined_sha256": artifacts["macro_joined"]["sha256"],
                               "__source_nodes_sha256": artifacts["macro_nodes"]["sha256"],
                               "__display_role": "city_navigation_classification_preview_not_research_admission",
                               "__is_independent_training_sample": False})
            rows.append(properties)
            geometries.append(Point(easting, northing))
    if seen != set(node_index) or source_variant_rows != len(nodes):
        raise ValueError("Selected variant does not have exactly one row per registered node")
    frame = gpd.GeoDataFrame(rows, geometry=geometries, crs=f"EPSG:{SOURCE_EPSG}")
    data = collection(frame, "macro_joined", "derived_regional_green_points",
                      artifacts["macro_joined"]["sha256"], derived=True)
    for feature in data["features"]:
        props = feature["properties"]
        feature["id"] = f"macro_joined:{variant}:{props['grid_id']}:navigation_center"
        props["__source_fid"] = props["__source_node_fid"]
    data["metadata"].update({
        "display_label": "绿色分类预览 · c4_min0 · 候选指标",
        "purpose": "city_navigation_classification_preview_not_research_admission",
        "source_variant": variant, "value_field": "G02",
        "value_unit": "dimensionless_fraction_0_to_1_not_percent",
        "source_variant_row_count": source_variant_rows,
        "selected_positive_grid_count": len(frame), "excluded_navigation_rows": dict(excluded),
        "selection": "exactly_one_c4_min0_row_per_grid_finite_0_lt_G02_le_1",
        "coordinate_derivation": "source_macro_node_center_e_m_center_n_m_EPSG32648_to_EPSG4326",
        "geometry_policy": "derived_node_center_points_not_green_patch_geometry",
        "independent_sample_policy": "one_navigation_point_per_grid_no_new_research_sample",
        "value_encoding": "original_csv_strings_no_rescaling_or_zero_imputation",
        "selected_fields": selected_fields,
        "field_definitions": {
            "G02": "retained_class_2_plus_class_3_projected_area_divided_by_10000m2",
            "G03": "retained_class_2_projected_area_divided_by_10000m2",
            "G04": "retained_class_3_projected_area_divided_by_10000m2",
            "identity": "G02_equals_G03_plus_G04",
            "filtered_green_ratio": "removed_green_fraction_base_G02_minus_retained_G02_not_existing_green",
        },
        "source_field_roles": {key: roles[key] for key in selected_fields},
        "source_references": [{"artifact_id": key,
                               "source_project_relative_path": artifacts[key]["source_project_relative_path"],
                               "sha256": artifacts[key]["sha256"]}
                              for key in ["macro_joined", "macro_nodes", "macro_field_roles"]],
        "definition_reference": {"source_project_relative_path": str(definition_path.relative_to(project_root)),
                                 "sha256": digest(definition_path), "total_line_count": len(lines),
                                 "confirmed_definition_line_numbers": anchor_lines,
                                 "evidence": "read_only_existing_code_and_registered_field_roles",
                                 "research_script_executed": False,
                                 "is_additional_registered_research_asset": False},
        "temperature_fields_included": False, "prediction_enabled": False,
        "physics_enabled": False, "scientific_validation_upgraded": False,
    })
    return data, frame


def regional_roads_reference(project_root: Path) -> tuple[JSON, JSON, Path]:
    """Validate a frozen historical navigation source without editing geometry.

    This additional source is deliberately separate from the original 24 research
    artifacts. Validation is JSON/count/coordinate-range inspection only.
    """
    path = (project_root / REGIONAL_ROADS_SOURCE).resolve()
    before = digest(path)
    if before != REGIONAL_ROADS_SOURCE_SHA256:
        raise ValueError("Historical navigation road source differs from its independent snapshot")
    data = read_json(path)
    if data.get("type") != "FeatureCollection" or len(data.get("features", [])) != 12032:
        raise ValueError("Historical navigation road source count/structure differs")
    bounds = [math.inf, math.inf, -math.inf, -math.inf]
    point_count, source_ids = 0, set()
    for feature in data["features"]:
        if feature.get("type") != "Feature" or not isinstance(feature.get("properties"), dict):
            raise ValueError("Historical navigation road feature is malformed")
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", [])
        if geometry.get("type") != "LineString" or len(coordinates) < 2:
            raise ValueError("Historical navigation source is not the expected road-line structure")
        source_ids.add(str(feature.get("id")))
        for coordinate in coordinates:
            if (not isinstance(coordinate, list) or len(coordinate) < 2
                    or any(isinstance(value, bool) or not isinstance(value, (int, float))
                           or not math.isfinite(value) for value in coordinate)
                    or abs(coordinate[0]) > 180 or abs(coordinate[1]) > 90):
                raise ValueError("Historical navigation road coordinate is outside lon/lat range")
            longitude, latitude = coordinate[:2]
            bounds = [min(bounds[0], longitude), min(bounds[1], latitude),
                      max(bounds[2], longitude), max(bounds[3], latitude)]
            point_count += 1
    metadata = {
        "file": "regional_roads_2021.geojson", "url": "/data/regional_roads_2021.geojson",
        "source_project_relative_path": REGIONAL_ROADS_SOURCE,
        "source_absolute_path": str(path), "source_snapshot_label": "2021年初",
        "source_snapshot_code": "210101", "source_sha256": before,
        "independent_expected_sha256": REGIONAL_ROADS_SOURCE_SHA256,
        "source_sha256_before": before, "source_bytes": path.stat().st_size,
        "source_feature_count": len(data["features"]), "source_unique_feature_id_count": len(source_ids),
        "coordinate_point_count": point_count, "bounds_lon_lat": bounds,
        "bounds_order": "west,south,east,north", "coordinate_order": "longitude,latitude",
        "coordinate_validation": "finite_lon_lat_range_only_not_positional_accuracy",
        "display_label": "2021历史导航参考",
        "purpose": "historical_2021_navigation_reference_only_not_current_network",
        "display_transform": "none_byte_for_byte_copy_original_JSON_id_properties_coordinates",
        "geometry_processed": False, "source_scripts_executed": False,
        "original_artifact_inventory_membership": False,
        "original_research_artifact_count_unchanged": 24,
        "current_network_claim": False, "road_width_verified": False,
        "walkability_validated": False, "research_integration_accepted": False,
        "scientific_validation_upgraded": False,
        "license_reference": "https://www.openstreetmap.org/copyright",
    }
    return data, metadata, path


def verify_geometry(data: JSON, frame: gpd.GeoDataFrame, *, parts: bool = False) -> JSON:
    """Check every saved feature, original attribute and inverse-transformed geometry."""
    if len(data["features"]) != len(frame):
        raise ValueError("Saved feature count mismatch")
    inverse = pyproj.Transformer.from_crs(DISPLAY_EPSG, SOURCE_EPSG, always_xy=True)
    worst = 0.0
    ids = set()
    for feature, (_, row) in zip(data["features"], frame.iterrows(), strict=True):
        if feature["id"] in ids:
            raise ValueError("Duplicate display feature ID")
        ids.add(feature["id"])
        geometry = shape(feature["geometry"])
        if geometry.is_empty or not geometry.is_valid:
            raise ValueError("Saved invalid/empty display geometry")
        native = transform(inverse.transform, geometry)
        error = native.hausdorff_distance(row.geometry)
        worst = max(worst, error)
        if not native.equals_exact(row.geometry, tolerance=ROUNDTRIP_TOLERANCE_M):
            raise ValueError("Reprojection changes source geometry beyond tolerance")
        for column in frame.columns:
            if column == frame.geometry.name:
                continue
            if feature["properties"].get(column) != normalized(row[column]):
                raise ValueError(f"Saved source property changed: {column}")
        if parts and feature["properties"]["__height_accuracy_verified"] is not False:
            raise ValueError("Derived preview height was incorrectly certified")
    return {"feature_count": len(frame), "all_source_properties_preserved": True,
            "all_full_geometries_roundtrip_verified": True,
            "roundtrip_tolerance_m": ROUNDTRIP_TOLERANCE_M,
            "maximum_hausdorff_error_m": worst, "unique_display_feature_ids": True}


def build_counts(frames: dict[str, gpd.GeoDataFrame], tables: JSON,
                 parts: JSON, scenario: JSON) -> JSON:
    """Reconcile display counts with the receipt rather than infer scientific objects."""
    nodes = frames["macro_nodes:candidate_nodes"]
    buildings = frames["micro_scene:buildings_uncut"]
    core = frames["micro_scene:core"].geometry.iloc[0]
    vegetation = frames["micro_scene:vegetation_core"]
    source_groups = sorted({str(value) for value in vegetation["source_component_ids"]})
    core_buildings = int((buildings.geometry.intersection(core).area > 0).sum())
    road_counts = {name: len(frame) for key, frame in frames.items()
                   if key.startswith("micro_roads:") for name in [key.split(":", 1)[1]]}
    counts = {
        "macro_nodes": len(nodes), "edges": tables["macro_edges"]["source_row_count"],
        "self_loops": tables["macro_edges"]["self_loop_count"],
        "macro_joined_rows": tables["macro_joined"]["source_row_count"],
        "independent_grid_count": tables["macro_joined"]["independent_grid_count"],
        "macro_variants": len(tables["macro_joined"]["variants"]),
        "macro_role_counts": dict(Counter(nodes["role"])),
        "micro_layers": {key.split(":", 1)[1]: len(frame) for key, frame in frames.items()
                         if key.startswith("micro_scene:")},
        "building_source_objects": len(buildings), "building_parts": len(parts["features"]),
        "core_building_source_objects": core_buildings,
        "vegetation_fragments": len(vegetation), "vegetation_source_group_ids": source_groups,
        "source_green_group_count": len(source_groups),
        "classified_projection_area_m2": float(vegetation["area_m2"].sum()),
        "road_records_per_snapshot": road_counts,
        "receptors": len(frames["micro_scene:receptor_candidates"]),
    }
    counts.update({"nodes": counts["macro_nodes"], "macro_edges": counts["edges"],
                   "macro_self_loops": counts["self_loops"],
                   "variant_rows": counts["macro_joined_rows"],
                   "building_source_count": counts["building_source_objects"],
                   "building_part_count": counts["building_parts"],
                   "vegetation_fragment_count": counts["vegetation_fragments"],
                   "roads_per_snapshot": road_counts})
    expected = {"nodes": 6567, "edges": 58215, "self_loops": 6567,
                "variant_rows": 39402, "independent_grid_count": 6567, "macro_variants": 6,
                "building_source_count": 53, "building_part_count": 54,
                "core_building_source_objects": 5, "vegetation_fragment_count": 3,
                "source_green_group_count": 1, "receptors": 6}
    for key, value in expected.items():
        if counts[key] != value:
            raise ValueError(f"Acceptance count failed: {key} {counts[key]} != {value}")
    if source_groups != ["17696"] or counts["classified_projection_area_m2"] != 1989:
        raise ValueError("Vegetation identity/area differs from receipt")
    if sorted(road_counts.values()) != [17, 17]:
        raise ValueError("Road snapshot counts differ")
    if len(tables["macro_joined"]["rows"]) != 6:
        raise ValueError("Selected site does not have six separate diagnostic variants")
    return counts


def run(project_root: Path, output: Path, check_only: bool,
        accept_platform_contract_update: bool = False) -> JSON:
    """Build or independently verify the scoped static display package."""
    handoff_path = project_root / "共享接口/成果能力清单.json"
    case_path = project_root / "共享接口/当前验收场景.json"
    package, scenario = read_json(handoff_path), read_json(case_path)
    artifacts = artifacts_by_id(package)
    before, source_changes = check_sources(project_root, artifacts, accept_platform_contract_update)
    handoff_hashes = {"inventory": digest(handoff_path), "case": digest(case_path)}
    files, frames, geometry_checks, layers, links = {}, {}, {}, {}, {}
    for artifact_id in ["macro_nodes", "micro_scene", "micro_roads"]:
        entry = artifacts[artifact_id]
        for layer in entry["layers"]:
            name = layer["name"]
            frame = load_layer(project_root, entry, layer)
            frames[f"{artifact_id}:{name}"] = frame
            data = collection(frame, artifact_id, name, before[artifact_id])
            filename = "macro_nodes.geojson" if artifact_id == "macro_nodes" else f"{artifact_id}_{name}.geojson"
            files[filename] = data
            links[f"{artifact_id}:{name}"] = "/data/" + filename
            if artifact_id == "micro_scene":
                layers[MICRO_ALIASES[name]] = data
    context, neighborhood = derive_context(frames["macro_nodes:candidate_nodes"], scenario, before["macro_nodes"])
    files["macro_neighborhood_300.geojson"] = context
    files["macro_neighborhood_nodes.geojson"] = neighborhood
    links.update({"macro_context300": "/data/macro_neighborhood_300.geojson",
                  "macro_neighborhood_nodes": "/data/macro_neighborhood_nodes.geojson"})
    layers["macro_context300"] = context
    layers["context500"] = layers["context"]
    layers["class_surface"] = layers["source_classes_context"]
    layers["overlap_review"] = layers["overlap_review_core"]
    layers["hard_review"] = layers["surface_review_core"]
    parts, part_frame = derive_parts(frames["micro_scene:buildings_uncut"], before["micro_scene"])
    files["building_parts.geojson"] = parts
    links["building_parts"] = "/data/building_parts.geojson"
    layers["building_parts"] = parts
    roads = {"type": "FeatureCollection", "features": [],
             "metadata": {"source_crs": "EPSG:32648", "display_crs": "EPSG:4326",
                          "snapshot_policy": "separate_source_snapshots_not_unique_road_count",
                          "source_sha256": before["micro_roads"], "complete_unclipped": True}}
    for name in ["roads_2020", "roads_2021"]:
        roads["features"].extend(files[f"micro_roads_{name}.geojson"]["features"])
    road_keys = {(feature["properties"]["rr_snapshot_label"], feature["properties"]["rr_source_feature_id"])
                 for feature in roads["features"]}
    if len(road_keys) != 34:
        raise ValueError("Road source snapshot/feature identity is not unique")
    files["roads.geojson"] = roads
    layers["roads"] = roads
    links["roads"] = "/data/roads.geojson"
    tables = {artifact_id: read_table(project_root, entry, scenario["site_id"])
              for artifact_id, entry in artifacts.items() if entry["type"] == "csv"}
    source_documents = {artifact_id: read_json(source_path(project_root, entry))
                        for artifact_id, entry in artifacts.items() if entry["type"] == "json"}
    green_points, green_point_frame = derive_regional_green_points(
        project_root, frames["macro_nodes:candidate_nodes"], artifacts, source_documents["macro_field_roles"])
    files["regional_green_points.geojson"] = green_points
    links["regional_green_points"] = "/data/regional_green_points.geojson"
    regional_roads, regional_roads_metadata, regional_roads_path = regional_roads_reference(project_root)
    files["regional_roads_2021.geojson"] = regional_roads
    links["regional_roads_2021"] = "/data/regional_roads_2021.geojson"
    counts = build_counts(frames, tables, parts, scenario)
    counts["regional_green_points"] = len(green_point_frame)
    file_links = dict(links, macro_nodes="/data/macro_nodes.geojson", tables="/data/tables.json",
                      source_metadata="/data/source_metadata.json", version_differences="/data/version_differences.json")
    scene = copy.deepcopy(scenario)
    scene.update({"display_schema_version": SCHEMA_VERSION, "layers": layers,
                  "records": tables["macro_joined"]["rows"], "tables": tables,
                  "counts": counts, "file_links": file_links,
                  "capabilities": copy.deepcopy(package["capabilities"]),
                  "results": {"temperature_improvement_C": None, "value_state": "not_calculated",
                              "prediction_enabled": False, "physics_enabled": False,
                              "optimal_recommendation_enabled": False},
                  "display_metadata": {"source_crs": "EPSG:32648", "display_crs": "EPSG:4326",
                                       "coordinate_order": "longitude,latitude",
                                       "purpose": "local_candidate_geometry_browse_not_scientific_model",
                                       "source_files_modified": False,
                                       "source_scripts_executed": False,
                                       "physical_solver_domain_defined": False,
                                       "scope_300_derivation": "handoff_bounds_rectangle_only_not_solver_domain",
                                       "public_redistribution_approved": False,
                                       "is_self_contained_research_export": False}})
    version_differences = {"schema_version": SCHEMA_VERSION,
                           "receipt_version_alignment": copy.deepcopy(scenario["version_alignment"]),
                           "changed_from_micro_frozen": [key for key, value in scenario["version_alignment"].items()
                                                         if value["same_as_frozen"] is False],
                           "policy": "preserve_frozen_and_current_values_no_silent_micro_rebuild",
                           "registered_current_hashes": before,
                           "authorised_platform_contract_changes": source_changes}
    files.update({"scene.json": scene, "tables.json": tables,
                  "source_metadata.json": source_documents,
                  "version_differences.json": version_differences,
                  "capabilities.json": {"source_capabilities": package["capabilities"],
                                        "display_results_state": scene["results"]}})
    if not check_only:
        for name, data in files.items():
            if name == "regional_roads_2021.geojson":
                write_original_bytes(output / name, regional_roads_path)
            else:
                write_json(output / name, data)
    for name, expected in files.items():
        actual = read_json(output / name)
        if actual != json.loads(json.dumps(expected, allow_nan=False)):
            raise ValueError(f"Independent saved JSON readback mismatch: {name}")
    for key, frame in frames.items():
        artifact_id, name = key.split(":", 1)
        filename = "macro_nodes.geojson" if artifact_id == "macro_nodes" else f"{artifact_id}_{name}.geojson"
        geometry_checks[key] = verify_geometry(read_json(output / filename), frame)
    geometry_checks["derived_building_parts"] = verify_geometry(read_json(output / "building_parts.geojson"), part_frame, parts=True)
    geometry_checks["derived_regional_green_points"] = verify_geometry(
        read_json(output / "regional_green_points.geojson"), green_point_frame)
    definition_reference = green_points["metadata"]["definition_reference"]
    if digest(project_root / definition_reference["source_project_relative_path"]) != definition_reference["sha256"]:
        raise ValueError("Read-only classification definition reference changed during preparation")
    regional_roads_after = digest(regional_roads_path)
    regional_roads_output_hash = digest(output / "regional_roads_2021.geojson")
    if regional_roads_after != regional_roads_metadata["source_sha256_before"] or regional_roads_output_hash != regional_roads_after:
        raise ValueError("Historical navigation source changed or was not copied byte for byte")
    regional_roads_metadata.update({"source_sha256_after": regional_roads_after,
                                    "source_unchanged_during_preparation": True,
                                    "display_sha256": regional_roads_output_hash,
                                    "independent_JSON_readback_equal": True,
                                    "source_and_display_bytes_identical": True})
    after, after_changes = check_sources(project_root, artifacts, accept_platform_contract_update)
    if (before != after or source_changes != after_changes
            or handoff_hashes != {"inventory": digest(handoff_path), "case": digest(case_path)}):
        raise ValueError("Research handoff/source changed during preparation; reject mixed build")
    output_files = [{"file": name, "url": "/data/" + name, "bytes": (output / name).stat().st_size,
                     "sha256": digest(output / name)} for name in sorted(files)]
    environment = {"python": sys.version.split()[0], "geopandas": gpd.__version__,
                   "shapely": shapely.__version__, "pyproj": pyproj.__version__,
                   "pyogrio": pyogrio.__version__, "pandas": pd.__version__, "numpy": np.__version__}
    verification = {"state": "display_copy_readback_passed_not_science_validation",
                    "geometry_checks": geometry_checks, "counts": counts,
                    "source_hashes_before": before, "source_hashes_after": after,
                    "all_24_sources_unchanged": True,
                    "unchanged_scope": "before_and_after_display_preparation",
                    "registered_sha256_match_count": len(artifacts) - len(source_changes),
                    "accepted_source_version_change_count": len(source_changes),
                    "original_research_state_axes_preserved": True,
                    "csv_original_values_and_empty_cells_preserved": True,
                    "version_alignment_preserved": True,
                    "roundtrip_tolerance_m": ROUNDTRIP_TOLERANCE_M,
                    "derived_context_300_not_solver_domain": True,
                    "regional_green_points": {"file": "regional_green_points.geojson",
                                              "sha256": digest(output / "regional_green_points.geojson"),
                                              "feature_count": len(green_point_frame),
                                              "single_variant_unique_grid_ids": True,
                                              "original_csv_fields_preserved": True,
                                              "derived_source_node_centers_verified": True,
                                              "no_temperature_fields": True,
                                              "scientific_validation_upgraded": False},
                    "regional_roads_2021": copy.deepcopy(regional_roads_metadata),
                    "source_scripts_executed": False, "physical_solver_run": False}
    manifest = copy.deepcopy(package)
    manifest["platform_adaptation"] = {"schema_version": SCHEMA_VERSION,
                                       "pipeline": "tools/prepare_data.py",
                                       "pipeline_sha256": digest(Path(__file__)),
                                       "environment": environment,
                                       "handoff_sha256": handoff_hashes,
                                       "output_files": output_files,
                                       "display_file_count": len(files) + 2,
                                       "regional_green_points": dict(green_points["metadata"],
                                                                     file="regional_green_points.geojson",
                                                                     sha256=digest(output / "regional_green_points.geojson")),
                                       "regional_roads_2021": copy.deepcopy(regional_roads_metadata),
                                       "source_unchanged": True,
                                       "source_version_changes": source_changes,
                                       "validation": verification,
                                       "browser_render_test": "pending_separate_frontend_acceptance",
                                       "data_package_kind": "local_static_display_copies_plus_reference_inventory",
                                       "public_redistribution_approved": False}
    if check_only:
        if read_json(output / "manifest.json") != manifest:
            raise ValueError("Saved manifest no longer matches source or display build")
    else:
        write_json(output / "manifest.json", manifest)
    if read_json(output / "manifest.json")["artifacts"] != package["artifacts"]:
        raise ValueError("Registered source metadata/status axes changed")
    report = dict(verification, manifest_sha256=digest(output / "manifest.json"),
                  scene_sha256=digest(output / "scene.json"))
    if not check_only:
        write_json(output / "readback_verification.json", report)
    elif read_json(output / "readback_verification.json") != report:
        raise ValueError("Independent verification receipt differs")
    LOG.info("Verified %s nodes, %s navigation green-classification points, %s building sources / %s parts, 8 scene layers, 2 road snapshots; %s hashes match inventory + %s recorded platform-spec change; all 24 unchanged during preparation",
             counts["nodes"], counts["regional_green_points"], counts["building_source_count"], counts["building_part_count"],
             len(artifacts) - len(source_changes), len(source_changes))
    return report


def main() -> None:
    """Expose build/readback modes, writing only this app's public/data directory."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Read and verify existing display files without writing")
    parser.add_argument("--accept-platform-contract-update", action="store_true",
                        help="Record the root-authorized product_contract update; never accept research source drift")
    arguments = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    project_root = Path(__file__).resolve().parents[2]
    output = Path(__file__).resolve().parents[1] / "public" / "data"
    run(project_root, output, arguments.check_only, arguments.accept_platform_contract_update)


if __name__ == "__main__":
    main()
