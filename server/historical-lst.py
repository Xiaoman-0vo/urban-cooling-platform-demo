"""Run the registered V3 estimator for a held-out historical grid and date."""

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import sys


MODEL_SHA256 = "9a2c5db870c913f24215aee390864ca2ddaa22002c7428408d6e20e2db375ad2"
MANIFEST_SHA256 = "1ad57cb859bcfa30e9e329d030ed7dbddaad8ed45e62868bbe648b8143a93e54"


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
        "reference_grid_count": len(reference), "model_version": "V3 同日校准梯度提升树",
        "model_sha256": MODEL_SHA256, "dataset_sha256": MANIFEST_SHA256,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiment", type=Path, required=True)
    parser.add_argument("--grid", required=True)
    parser.add_argument("--date", required=True)
    parser.add_argument("--pilot", type=Path, metavar="PROJECT", help="Run the offline A/B raster experiment")
    args = parser.parse_args()
    if args.pilot:
        case = load_case(args.experiment, args.grid, args.date)
        if case is None:
            parser.error("Pilot comparison needs a registered historical sample")
        from pilot_lst import compare

        report = compare(args.pilot, *case)
        report.update(model_sha256=MODEL_SHA256, dataset_sha256=MANIFEST_SHA256)
        print(json.dumps(report, indent=2, allow_nan=False))
    else:
        print(json.dumps(estimate(args.experiment, args.grid, args.date)))
