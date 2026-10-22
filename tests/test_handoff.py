"""Read-only C01-C08 checks for the real local-reference handoff.

This test checks JSON contracts and view copies, never runs research models.
Use HANDOFF_DATA_DIR to override public/data and HANDOFF_EXPORT_FILE to verify
an actual downloaded export. Missing static data fail; absent export is skipped.
"""

from __future__ import annotations

import json
import os
import re
import unittest
from collections import Counter
from pathlib import Path
from typing import Any
from zipfile import ZipFile, is_zipfile

APP_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = APP_ROOT.parent
DATA_ROOT = Path(os.environ.get("HANDOFF_DATA_DIR", APP_ROOT / "public" / "data"))
SOURCE_ROOT = PROJECT_ROOT / "共享接口"
AXES = ("file_acceptance", "science_validation", "integration", "execution")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
EXPORT_SCHEMA_VERSION = "0.1.local-view-handoff"
MAX_EXPORT_JSON_BYTES = 64 * 1024 * 1024


def reject_nonfinite(value: str) -> None:
    """Reject nonstandard JSON numeric values."""
    raise ValueError(f"Nonfinite JSON number is forbidden: {value}")


def load_json(path: Path) -> dict[str, Any]:
    """Load one UTF-8 JSON object without writing to disk."""
    if not path.is_file():
        raise FileNotFoundError(f"Required handoff JSON is missing: {path}")
    value = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_nonfinite)
    if not isinstance(value, dict):
        raise ValueError(f"Top-level handoff value must be an object: {path}")
    return value


def load_export(path: Path) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Read JSON or ZIP into memory; never extract untrusted archive paths."""
    if not path.is_file():
        raise FileNotFoundError(f"Actual exported file is missing: {path}")
    if not is_zipfile(path):
        return load_json(path), None
    with ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Export ZIP contains duplicate member names")
        if "project.json" not in names:
            raise ValueError("Export ZIP does not contain project.json")
        members: dict[str, Any] = {}
        for info in archive.infolist():
            if not (info.filename == "project.json" or (
                info.filename.startswith("layers/") and info.filename.endswith(".geojson")
            )):
                continue
            if info.file_size > MAX_EXPORT_JSON_BYTES:
                raise ValueError(f"Export JSON member exceeds safety limit: {info.filename}")
            payload = json.loads(
                archive.read(info).decode("utf-8"), parse_constant=reject_nonfinite
            )
            if not isinstance(payload, dict):
                raise ValueError(f"Export JSON member is not an object: {info.filename}")
            members[info.filename] = payload
        return members["project.json"], members


def artifact_index(package: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Index an already loaded source inventory."""
    return {item["artifact_id"]: item for item in package["artifacts"]}


def source_component_ids(value: Any) -> set[str]:
    """Interpret preserved source ID values without modifying their storage."""
    if isinstance(value, list):
        return {str(item) for item in value}
    if value is None or value == "":
        return set()
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return {item.strip() for item in re.split(r"[,;|]", value) if item.strip()}
        if isinstance(decoded, list):
            return {str(item) for item in decoded}
        return {str(decoded)}
    return {str(value)}


class HandoffContractTest(unittest.TestCase):
    """Independent checks against the root's fixed acceptance case."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = load_json(DATA_ROOT / "manifest.json")
        cls.scene = load_json(DATA_ROOT / "scene.json")
        cls.source_manifest = load_json(SOURCE_ROOT / "成果能力清单.json")
        cls.source_scene = load_json(SOURCE_ROOT / "当前验收场景.json")
        cls.artifacts = artifact_index(cls.manifest)
        cls.source_artifacts = artifact_index(cls.source_manifest)
        cls.expected = {
            item["check_id"]: item["expected"] for item in cls.source_scene["checks"]
        }

    def features(self, name: str) -> list[dict[str, Any]]:
        """Return one required FeatureCollection after checking its shape."""
        layer = self.scene["layers"][name]
        self.assertEqual(layer["type"], "FeatureCollection", name)
        features = layer["features"]
        self.assertIsInstance(features, list, name)
        return features

    def test_c01_counts_and_macro_identity(self) -> None:
        """Six variants must not become six independent spatial samples."""
        expected = self.expected["C01"]
        node_layer = self.artifacts["macro_nodes"]["layers"][0]
        edge = self.artifacts["macro_edges"]
        joined = self.artifacts["macro_joined"]
        self.assertEqual(node_layer["row_count"], expected["nodes"])
        self.assertEqual(self.artifacts["macro_nodes"]["role_counts"], expected["role_counts"])
        self.assertEqual(edge["row_count"], expected["edges"])
        self.assertEqual(edge["self_loop_count"], expected["self_loops"])
        self.assertEqual(joined["row_count"], expected["variant_rows"])
        self.assertEqual(joined["unique_object_count"], expected["independent_grid_count"])
        count_fields = {
            "macro_nodes": "nodes",
            "macro_edges": "edges",
            "macro_self_loops": "self_loops",
            "macro_joined_rows": "variant_rows",
            "independent_grid_count": "independent_grid_count",
        }
        counts = self.scene["counts"]
        for actual_name, expected_name in count_fields.items():
            self.assertEqual(counts[actual_name], expected[expected_name], actual_name)
        records = self.scene["records"]
        self.assertEqual(len(records), len(joined["variants"]))
        self.assertEqual({row["variant"] for row in records}, set(joined["variants"]))
        self.assertEqual({row["grid_id"] for row in records}, {self.source_scene["site_id"]})
        self.assertEqual(
            len({(row["grid_id"], row["variant"]) for row in records}), len(records)
        )
        for row in records:
            self.assertEqual(set(row), set(joined["fields"]))
            self.assertTrue(all(isinstance(value, str) for value in row.values()))
        if "macro_variants" in counts:
            value = counts["macro_variants"]
            self.assertEqual(
                sorted(value) if isinstance(value, list) else value,
                sorted(joined["variants"]) if isinstance(value, list) else len(joined["variants"]),
            )

    def test_c02_scopes_and_coordinate_contract(self) -> None:
        """Preview extents cannot be promoted to a physical solver domain."""
        self.assertEqual(self.scene["scope_registry"], self.source_scene["scope_registry"])
        scopes = {scope["support_id"]: scope for scope in self.scene["scope_registry"]}
        for support_id, width in (
            ("core_100", 100),
            ("macro_neighborhood_300", 300),
            ("micro_preparation_500", 500),
        ):
            scope = scopes[support_id]
            self.assertEqual(scope["width_m"], width)
            bounds = scope["bounds_m"]
            self.assertEqual(bounds[2] - bounds[0], width)
            self.assertEqual(bounds[3] - bounds[1], width)
        for support_id in ("macro_neighborhood_300", "micro_preparation_500"):
            self.assertIs(scopes[support_id]["not_final_solver_domain"], True)
        solver = scopes["physical_solver_domain"]
        self.assertIsNone(solver["width_m"])
        self.assertIsNone(solver["bounds_m"])
        self.assertEqual(solver["status"], "not_defined")
        self.assertEqual(self.scene["crs"], "EPSG:32648")
        self.assertEqual(self.scene["coordinate_mapping"], self.source_scene["coordinate_mapping"])
        if "context" in self.scene["layers"]:
            self.assertEqual(self.scene["layers"]["context"], self.scene["layers"]["context500"])

    def test_c03_source_buildings_and_receptors(self) -> None:
        """Parts and candidate receptors retain their original scientific status."""
        expected = self.expected["C03"]
        buildings = self.features("buildings")
        receptors = self.features("receptors")
        self.assertEqual(len(buildings), expected["context_source_buildings"])
        self.assertEqual(
            len({str(feature["properties"]["merged_id"]) for feature in buildings}),
            expected["context_source_buildings"],
        )
        self.assertEqual(len(receptors), expected["candidate_receptors"])
        self.assertEqual(
            len({feature["properties"]["receptor_id"] for feature in receptors}),
            expected["candidate_receptors"],
        )
        counts = self.scene["counts"]
        self.assertEqual(counts["building_source_objects"], expected["context_source_buildings"])
        self.assertEqual(counts["core_building_source_objects"], expected["core_source_buildings"])
        self.assertEqual(counts["receptors"], expected["candidate_receptors"])
        for name in ("buildings", "vegetation", "roads", "receptors"):
            features = self.features(name)
            ids = []
            for feature in features:
                props = feature["properties"]
                for field in ("__artifact_id", "__source_layer", "__source_fid"):
                    self.assertIn(field, props, (name, field))
                expected_id = f'{props["__artifact_id"]}:{props["__source_layer"]}:{props["__source_fid"]}'
                self.assertEqual(str(feature["id"]), expected_id)
                ids.append(feature["id"])
            self.assertEqual(len(ids), len(set(ids)), name)
        self.assertEqual(self.scene["checks"], self.source_scene["checks"])
        self.assertIs(expected["work_height_accuracy_verified"], False)
        self.assertEqual(expected["receptor_measurement_status"], "not_measured_or_confirmed")

    def test_c04_vegetation_fragment_source_groups(self) -> None:
        """Three view fragments remain one source component, not three parks."""
        expected = self.expected["C04"]
        vegetation = self.features("vegetation")
        self.assertEqual(len(vegetation), expected["fragments"])
        self.assertEqual(
            len({str(feature["properties"]["local_id"]) for feature in vegetation}),
            expected["fragments"],
        )
        group_ids: set[str] = set()
        area = 0.0
        for feature in vegetation:
            props = feature["properties"]
            group_ids.update(source_component_ids(props["source_component_ids"]))
            area += float(props["area_m2"])
        self.assertEqual(group_ids, set(expected["source_component_ids"]))
        self.assertEqual(len(group_ids), expected["source_group_count"])
        self.assertAlmostEqual(area, expected["classified_projection_area_m2"], places=6)
        counts = self.scene["counts"]
        self.assertEqual(counts["vegetation_fragments"], expected["fragments"])
        self.assertEqual(set(map(str, counts["vegetation_source_group_ids"])), group_ids)
        self.assertIs(expected["real_independent_green_spaces_verified"], False)

    def test_c05_road_snapshot_identity(self) -> None:
        """Rows from two snapshots cannot be counted as independent roads."""
        expected = self.expected["C05"]
        roads = self.features("roads")
        snapshots = Counter(
            str(feature["properties"]["rr_snapshot_label"]) for feature in roads
        )
        self.assertEqual(len(snapshots), expected["snapshot_count"])
        self.assertEqual(set(snapshots.values()), {expected["road_line_records_per_snapshot"]})
        keys = [
            (
                str(feature["properties"]["rr_snapshot_label"]),
                str(feature["properties"]["rr_source_feature_id"]),
            )
            for feature in roads
        ]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertTrue(all(snapshot and source_id for snapshot, source_id in keys))
        source_layers = Counter(
            str(feature["properties"]["__source_layer"]) for feature in roads
        )
        self.assertEqual(
            self.scene["counts"]["road_records_per_snapshot"], dict(source_layers)
        )
        layer_to_snapshot: dict[str, set[str]] = {}
        for feature in roads:
            props = feature["properties"]
            layer_to_snapshot.setdefault(str(props["__source_layer"]), set()).add(
                str(props["rr_snapshot_label"])
            )
        self.assertEqual(len(layer_to_snapshot), expected["snapshot_count"])
        self.assertTrue(all(len(labels) == 1 for labels in layer_to_snapshot.values()))
        self.assertEqual(
            {next(iter(labels)) for labels in layer_to_snapshot.values()}, set(snapshots)
        )
        self.assertEqual(expected["unique_road_count_from_combined_rows"], "not_inferred")
        self.assertIs(expected["road_polygon_available"], False)
        self.assertIs(expected["hard_review_is_plantable"], False)

    def test_c06_missing_results_and_separate_area_objective(self) -> None:
        """Unknown heat results stay null and the area objective remains separate."""
        for field, value in self.expected["C06"].items():
            self.assertEqual(self.scene["results"][field], value, field)
            if value is None:
                self.assertIsNone(self.scene["results"][field])
            if value is False:
                self.assertIs(self.scene["results"][field], False)
        capabilities = {item["capability_id"]: item for item in self.manifest["capabilities"]}
        self.assertEqual(capabilities["I04"]["objective_id"], "normalized_indicator_distance")
        area = capabilities["I08"]
        self.assertEqual(area["objective_id"], "added_green_projection_area_m2")
        self.assertEqual(area["not_equivalent_to_objective"], "normalized_indicator_distance")
        self.assertEqual(area["search_conclusion"], "not_run")
        self.assertIsNone(capabilities["I11"]["weights"])
        self.assertIsNone(capabilities["I11"]["overall_score"])
        for row in self.scene["records"]:
            self.assertEqual(row["formal_training_input_accepted"].lower(), "false")
            self.assertEqual(row["formal_training_label_accepted"].lower(), "false")

    def test_c07_current_and_frozen_versions(self) -> None:
        """A changed source version cannot overwrite the preparation snapshot."""
        self.assertEqual(self.manifest["package_id"], self.source_manifest["package_id"])
        self.assertEqual(self.manifest["package_version"], self.source_manifest["package_version"])
        self.assertEqual(self.scene["version_alignment"], self.source_scene["version_alignment"])
        alignment = self.scene["version_alignment"]["joined_diagnostics"]
        self.assertNotEqual(alignment["current_sha256"], alignment["frozen_sha256"])
        self.assertIs(alignment["same_as_frozen"], False)
        self.assertEqual(
            self.artifacts["macro_joined"]["sha256"], alignment["current_sha256"]
        )
        for artifact_id, source in self.source_artifacts.items():
            current = self.artifacts[artifact_id]
            for field in (
                "sha256", "bytes", "source_absolute_path", "source_project_relative_path",
                "source_observation_time", "source_date_status", "package_relative_path",
                "license_status",
            ):
                self.assertEqual(current[field], source[field], (artifact_id, field))
            self.assertRegex(current["sha256"], SHA256_PATTERN)
        adaptation = self.manifest["platform_adaptation"]
        validation = adaptation["validation"]
        before = validation["source_hashes_before"]
        after = validation["source_hashes_after"]
        self.assertEqual(before, after)
        self.assertEqual(set(before), set(self.source_artifacts))
        self.assertIs(adaptation["source_unchanged"], True)
        self.assertIs(validation["all_24_sources_unchanged"], True)
        changes_list = adaptation.get("source_version_changes", [])
        changes = {item["artifact_id"]: item for item in changes_list}
        self.assertEqual(len(changes), len(changes_list))
        self.assertLessEqual(set(changes), {"product_contract"})
        for artifact_id, source in self.source_artifacts.items():
            expected_hash = source["sha256"]
            if artifact_id in changes:
                change = changes[artifact_id]
                self.assertEqual(change["original_sha256"], expected_hash)
                self.assertEqual(change["frozen_sha256"], expected_hash)
                self.assertEqual(change["source_path"], source["source_absolute_path"])
                self.assertEqual(change["reason"], "authorised_current_platform_spec_sync")
                self.assertEqual(
                    change["accepted_for"],
                    "platform_contract_reference_only_not_scientific_rebuild",
                )
                self.assertRegex(change["live_sha256"], SHA256_PATTERN)
                self.assertNotEqual(change["live_sha256"], expected_hash)
                expected_hash = change["live_sha256"]
            self.assertEqual(before[artifact_id], expected_hash, artifact_id)
        self.assertEqual(validation["accepted_source_version_change_count"], len(changes))
        self.assertEqual(
            validation["registered_sha256_match_count"],
            len(self.source_artifacts) - len(changes),
        )

    def test_c08_source_ids_nulls_and_four_axes(self) -> None:
        """Adaptation preserves source receipts without claiming scientific validity."""
        self.assertEqual(self.manifest["artifact_count"], self.source_manifest["artifact_count"])
        self.assertEqual(len(self.manifest["artifacts"]), self.manifest["artifact_count"])
        self.assertEqual(set(self.artifacts), set(self.source_artifacts))
        self.assertEqual(
            len({item["artifact_id"] for item in self.manifest["artifacts"]}),
            self.manifest["artifact_count"],
        )
        self.assertEqual(self.manifest["package_kind"], self.source_manifest["package_kind"])
        for artifact_id, source in self.source_artifacts.items():
            for field, value in source.items():
                self.assertIn(field, self.artifacts[artifact_id], (artifact_id, field))
                self.assertEqual(self.artifacts[artifact_id][field], value, (artifact_id, field))
            for axis in AXES:
                self.assertEqual(self.artifacts[artifact_id][axis], source[axis], (artifact_id, axis))
            self.assertIsNone(self.artifacts[artifact_id]["package_relative_path"])
            self.assertEqual(
                self.artifacts[artifact_id]["source_observation_time"],
                source["source_observation_time"],
            )
        for field in (
            "case_id", "project_id", "site_id", "scenario_id", "scenario_type",
            "scientific_scope", "sample_status", "center_lon_lat", "identity_rules",
        ):
            self.assertEqual(self.scene[field], self.source_scene[field], field)
        self.assertEqual(self.manifest["capabilities"], self.source_manifest["capabilities"])
        self.assertIn("platform_adaptation", self.manifest)
        for field, value in self.source_scene.items():
            self.assertIn(field, self.scene, field)
            self.assertEqual(self.scene[field], value, field)

    def test_c08_actual_export_when_provided(self) -> None:
        """Verify an actual download; this alone still does not prove browser import."""
        export_file = os.environ.get("HANDOFF_EXPORT_FILE")
        if not export_file:
            self.skipTest("Actual export file not supplied; browser download/import unverified")
        exported, zip_members = load_export(Path(export_file))
        self.assertEqual(exported["export_schema_version"], EXPORT_SCHEMA_VERSION)
        for key in ("sourcePackage", "scene", "layers", "uiState", "imports", "software_receipt"):
            self.assertIn(key, exported)
        self.assertEqual(exported["sourcePackage"], self.manifest)
        self.assertEqual(exported["scene"], self.scene)
        self.assertEqual(exported["layers"], self.scene["layers"])
        self.assertIsInstance(exported["uiState"], dict)
        self.assertIsInstance(exported["imports"], list)
        self.assertIsInstance(exported["software_receipt"], dict)
        for key in ("scenario_id", "scope_registry", "version_alignment", "results"):
            self.assertEqual(exported["scene"][key], self.scene[key], key)
        if zip_members is not None:
            for name, layer in exported["layers"].items():
                member_name = f"layers/{name}.geojson"
                self.assertIn(member_name, zip_members)
                self.assertEqual(zip_members[member_name], layer, member_name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
