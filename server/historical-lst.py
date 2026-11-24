"""Run the registered V3 estimator with a frozen historical reference."""

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import sys


MODEL_SHA256 = "9a2c5db870c913f24215aee390864ca2ddaa22002c7428408d6e20e2db375ad2"
MANIFEST_SHA256 = "1ad57cb859bcfa30e9e329d030ed7dbddaad8ed45e62868bbe648b8143a93e54"
MODEL_VERSION = "V3 同日校准梯度提升树"


def verified_bytes(path, expected):
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != expected:
        raise ValueError(f"V3 checksum mismatch: {path.name}")
    return payload


def load_case(experiment, grid_id, date):
    data = experiment / "data-v3"
    manifest = json.loads(verified_bytes(data / "manifest.json", MANIFEST_SHA256))
    if date not in manifest["test_dates"]:
        return None

    raw = verified_bytes(data / "test.jsonl", manifest["split_sha256"]["test"])
    target = next((row for row in map(json.loads, raw.splitlines())
                   if row["grid_id"] == grid_id and row["date"] == date and row["group"] == "unseen_date"), None)
    if target is None:
        return None

    raw_reference = verified_bytes(data / "reference.jsonl", manifest["reference_rows_sha256"])
    reference = [row for row in map(json.loads, raw_reference.splitlines()) if row["date"] == date]
    if {row["grid_id"] for row in reference} != set(manifest["reference_anchors"][date]["grid_ids"]):
        raise ValueError("V3 reference grid set differs from the manifest")

    import joblib

    sys.path.insert(0, str(experiment))
    artifact = joblib.load(io.BytesIO(verified_bytes(experiment / "tabular-v3" / "model.joblib", MODEL_SHA256)))
    if artifact["schema"] != manifest["schema"] or artifact["feature_order"] != manifest["features"]:
        raise ValueError("V3 model and data schema differ")
    return manifest, target, reference, artifact


def estimate(experiment, grid_id, date):
    case = load_case(experiment, grid_id, date)
    if case is None:
        return {"status": "no_data", "grid_id": grid_id, "date": date}
    manifest, target, reference, artifact = case
    from fit_tabular_v2 import predict_grid

    features = {key: target[key] for key in ("grid_id", "date", "center", "neighbor_mean")}
    result = predict_grid(artifact, features, reference)
    if not math.isfinite(result):
        raise ValueError("V3 estimate is not finite")
    return {
        "status": "estimated", "grid_id": grid_id, "date": date,
        "scene_id": target["scene_id"], "observed_utc": manifest["sources"][target["scene_id"]]["observed_utc"],
        "estimated_lst_c": round(result, 3), "observed_lst_c": target["lst_c"],
        "reference_grid_count": len(reference), "model_version": MODEL_VERSION,
        "model_sha256": MODEL_SHA256, "dataset_sha256": MANIFEST_SHA256,
    }


def evaluate_cover_scenario(experiment, grid_id, date, registration, registration_sha256, box):
    mask = json.loads(verified_bytes(registration, registration_sha256))
    case = load_case(experiment, grid_id, date)
    if case is None:
        raise ValueError("The scenario requires a registered historical sample")
    manifest, target, reference, artifact = case
    from fit_tabular_v2 import predict_grid

    scene = manifest["sources"][target["scene_id"]]
    hashes = {name.replace("\\", "/"): value for name, value in scene["source_sha256"].items()}
    if (mask["reference_date"] != date or mask["scene_id"] != target["scene_id"]
            or target["grid_id"] != "E4125_N33891" or mask["measurement_crs"] != "EPSG:32648"
            or len(mask["raster_sha256"]) != 2
            or any(hashes.get(name) != value for name, value in mask["raster_sha256"].items())):
        raise ValueError("The registered cover mask and the V3 sources differ")

    x, y, right, top = box
    mx, my, mr, mt = mask["bounds_utm"]
    gx, gy = target["e_cell"] * 100, target["n_cell"] * 100
    if not (gx <= mx <= x < right <= mr <= gx + 100 and gy <= my <= y < top <= mt <= gy + 100):
        raise ValueError("The selected rectangle must lie within the registered mask and target grid")

    source, destination = mask["source_cover_class"], mask["scenario_cover_class"]
    if ((source, destination) != (1, 2) or mask["height_evidence"] != "missing"
            or manifest["features"][1:3] != ["ubgg_class_1_pct", "ubgg_class_2_pct"] or artifact["with_weather"]):
        raise ValueError("Unsupported feature conversion")
    area = (right - x) * (top - y)
    shift = area / 100  # Percentage points in one 100 m by 100 m grid.
    baseline = {key: target[key] for key in ("grid_id", "date", "center", "neighbor_mean")}
    center = list(baseline["center"])
    center[source] = round(center[source] - shift, 3)
    center[destination] = round(center[destination] + shift, 3)
    if not (0 <= center[source] <= 100 and 0 <= center[destination] <= 100):
        raise ValueError("Compiled land-cover shares exceed the grid area")
    baseline_estimate = predict_grid(artifact, baseline, reference)
    scenario_estimate = predict_grid(artifact, dict(baseline, center=center), reference)
    return {
        "status": "scenario_estimated", "grid_id": grid_id, "date": date, "bounds_utm": box,
        "area_m2": area, "area_sha256": registration_sha256, "scene_id": target["scene_id"],
        "observed_utc": scene["observed_utc"], "reference_grid_count": len(reference),
        "observed_lst_c": target["lst_c"], "baseline_lst_c": round(baseline_estimate, 3),
        "scenario_lst_c": round(scenario_estimate, 3),
        "predicted_delta_lst_c": round(baseline_estimate - scenario_estimate, 3),
        "model_version": MODEL_VERSION, "model_sha256": MODEL_SHA256, "dataset_sha256": MANIFEST_SHA256,
        "compiled_features": {"order": manifest["features"], "baseline_center": baseline["center"],
                              "scenario_center": center, "neighbor_mean": baseline["neighbor_mean"]},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiment", type=Path, required=True)
    parser.add_argument("--grid", required=True)
    parser.add_argument("--date", required=True)
    parser.add_argument("--pilot", type=Path, metavar="PROJECT", help="Run the offline A/B raster experiment")
    parser.add_argument("--scenario-bounds", type=int, nargs=4)
    parser.add_argument("--temperature-area", type=Path)
    parser.add_argument("--temperature-area-sha256")
    args = parser.parse_args()
    if args.pilot:
        case = load_case(args.experiment, args.grid, args.date)
        if case is None:
            parser.error("Pilot comparison needs a registered historical sample")
        from pilot_lst import compare

        report = compare(args.pilot, *case)
        report.update(model_sha256=MODEL_SHA256, dataset_sha256=MANIFEST_SHA256)
        print(json.dumps(report, indent=2, allow_nan=False))
    elif args.scenario_bounds is not None:
        if not args.temperature_area or not args.temperature_area_sha256:
            parser.error("Scenario comparison needs a registered raster mask and its SHA-256")
        report = evaluate_cover_scenario(args.experiment, args.grid, args.date, args.temperature_area,
                                         args.temperature_area_sha256, args.scenario_bounds)
        print(json.dumps(report, allow_nan=False))
    else:
        print(json.dumps(estimate(args.experiment, args.grid, args.date)))
