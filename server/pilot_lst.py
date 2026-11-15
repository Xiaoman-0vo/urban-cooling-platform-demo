"""Offline UBGG cover conversion for the registered Chengdu pilot."""

from collections import Counter
import hashlib
import json
import math

import numpy as np
import rasterio

from build_dataset import CELL, CRS, FEATURES, source_window
from fit_tabular_v2 import predict_grid


DATA = "datasets/extracted/03/urban-cooling-data-20261022/data"
UBGG = f"{DATA}/UBGG_Chengdu/chengdu_UBGG_3m.tif"
CNBH = f"{DATA}/CNBH2020/CNBH10m_X105Y31.tif"
IMPERVIOUS = 1
TREE_SHRUB = 2


def intersection(a, b):
    return max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])


def area(box):
    return max(0, box[2] - box[0]) * max(0, box[3] - box[1])


def pixels(dataset, box, resolution):
    """Read only the relevant raster window, retaining exact edge intersections."""
    transform = dataset.transform
    if (transform.a, transform.b, transform.d, transform.e) != (resolution, 0, 0, -resolution):
        raise ValueError("Unexpected pilot raster pixel geometry")
    window = source_window(dataset, box)
    values = dataset.read(1, window=window)
    origin = dataset.window_transform(window)
    cells = []
    for (row, col), value in np.ndenumerate(values):
        left, top = origin * (col, row)
        clipped = intersection(box, (left, top - resolution, left + resolution, top))
        if area(clipped):
            cells.append((None if value == dataset.nodata or not math.isfinite(value) else value.item(), clipped))
    if not math.isclose(sum(area(cell) for _, cell in cells), area(box), abs_tol=1e-6):
        raise ValueError("Raster does not cover the pilot rectangle")
    return cells


def verify_raster(path, digest):
    sha256 = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            sha256.update(chunk)
    if sha256.hexdigest() != digest:
        raise ValueError(f"Pilot raster differs from the V3 source: {path.name}")


def cover_areas(cells):
    totals = Counter()
    for label, box in cells:
        totals[label] += area(box)
    return totals


def model_row(target, center):
    return {"grid_id": target["grid_id"], "date": target["date"],
            "center": center, "neighbor_mean": target["neighbor_mean"]}


def compare(project, manifest, target, reference, artifact):
    seed_path = "public/data/planning-pilot.json"
    seed_bytes = (project / seed_path).read_bytes()
    pilot = json.loads(seed_bytes)
    if pilot["id"] != "chengdu-E4125_N33891-discussion-v1" or pilot["site_id"] != target["grid_id"]:
        raise ValueError("The raster comparison requires the registered Chengdu A/B grid")
    if [candidate["id"] for candidate in pilot["candidates"]] != ["A", "B"]:
        raise ValueError("Expected the registered candidates A and B")
    if manifest["features"] != FEATURES or artifact["with_weather"]:
        raise ValueError("Unsupported model feature set for this experiment")
    scene = manifest["sources"][target["scene_id"]]
    source_hashes = {name.replace("\\", "/"): value for name, value in scene["source_sha256"].items()}
    for name in (UBGG, CNBH):
        verify_raster(project / name, source_hashes[name])

    easting, northing = (target[key] * CELL for key in ("e_cell", "n_cell"))
    core = (easting, northing, easting + CELL, northing + CELL)
    core_area = area(core)
    center = target["center"]
    baseline = predict_grid(artifact, model_row(target, center), reference)
    candidates = []
    with rasterio.open(project / UBGG) as green, rasterio.open(project / CNBH) as height:
        cover = cover_areas(pixels(green, core, 3))
        if sum(cover[label] for label in range(5)) != core_area:
            raise ValueError("This comparison requires complete UBGG coverage in the core grid")
        built = [(value, area(box)) for value, box in pixels(height, core, 10)
                 if value is not None and value > 0]
        built_area = sum(weight for _, weight in built)
        recomputed = [cover[label] * 100 / core_area for label in range(5)] + [
            built_area * 100 / core_area,
            sum(value * weight for value, weight in built) / built_area if built_area else None,
        ]
        if any(value != saved and (value is None or saved is None or abs(value - saved) > 0.001)
               for value, saved in zip(recomputed, center, strict=True)):
            raise ValueError("The raster calculation does not reproduce the recorded baseline features")

        for candidate in pilot["candidates"]:
            box = candidate["bounds_utm"]
            if len(box) != 4 or not all(type(coordinate) is int for coordinate in box):
                raise ValueError("Invalid candidate rectangle")
            footprint = area(box)
            if footprint <= 0 or area(intersection(box, core)) != footprint:
                raise ValueError("Candidate must be entirely within the baseline grid")
            ground = pixels(green, box, 3)
            heights = pixels(height, box, 10)
            impervious = [part for label, part in ground if label == IMPERVIOUS]
            nonpositive_height = positive_height = unknown_height = 0
            for ground_part in impervious:
                for value, height_part in heights:
                    overlap = area(intersection(ground_part, height_part))
                    if value is None:
                        unknown_height += overlap
                    elif value > 0:
                        positive_height += overlap
                    else:
                        nonpositive_height += overlap
            # The missing-height portion is included only as a conditional sensitivity test.
            sensitivity_area = nonpositive_height + unknown_height
            status = "no_eligible_area"
            if sensitivity_area:
                status = "conditional_on_cnbh_gap" if unknown_height else "exploratory_model_response"
            result = {
                "candidate_id": candidate["id"], "bounds_utm": box, "footprint_m2": footprint,
                "impervious_m2": sum(map(area, impervious)),
                "impervious_with_positive_cnbh_m2": positive_height,
                "impervious_with_unavailable_cnbh_m2": unknown_height,
                "impervious_with_nonpositive_cnbh_m2": nonpositive_height,
                "assumed_converted_m2": sensitivity_area,
                "status": status,
                "center": None, "estimated_lst_c": None, "baseline_minus_scenario_c": None,
            }
            if sensitivity_area:
                scenario_center = list(center)
                shift = sensitivity_area * 100 / core_area
                scenario_center[IMPERVIOUS] = round(center[IMPERVIOUS] - shift, 3)
                scenario_center[TREE_SHRUB] = round(center[TREE_SHRUB] + shift, 3)
                estimate = predict_grid(artifact, model_row(target, scenario_center), reference)
                result.update(center=scenario_center, estimated_lst_c=round(estimate, 3),
                              baseline_minus_scenario_c=round(baseline - estimate, 3))
            candidates.append(result)
    return {
        "schema": "chengdu-pilot-lst-experiment/1",
        "status": "exploratory_no_intervention_validation",
        "pilot_id": pilot["id"],
        "site_id": target["grid_id"],
        "date": target["date"],
        "scene_id": target["scene_id"],
        "observed_utc": scene["observed_utc"],
        "measurement_crs": CRS,
        "reference_grid_count": len(reference),
        "pilot_sha256": hashlib.sha256(seed_bytes).hexdigest(),
        "raster_sha256": {name: source_hashes[name] for name in (UBGG, CNBH)},
        "feature_order": FEATURES,
        "intervention": {"from_ubgg_class": IMPERVIOUS, "to_ubgg_class": TREE_SHRUB,
                         "mask": "impervious_excluding_positive_cnbh",
                         "assumption": "Missing CNBH heights are only considered under assumed site verification."},
        "baseline": {"observed_lst_c": target["lst_c"], "estimated_lst_c": round(baseline, 3),
                     "center": center, "neighbor_mean": target["neighbor_mean"]},
        "candidates": candidates,
    }
