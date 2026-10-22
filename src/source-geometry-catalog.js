// Frozen source geometry, known failures and verified key aliases; no scientific adoption.
export const GEOMETRY_SOURCE_SCHEMA="0.1.read-only-source-geometry";
export const GEOMETRY_SOURCE_MANIFEST=Object.freeze({"path":"平台产品设计/来源几何与对象三组接入清单_20261006.json","bytes":47045,"sha256":"55534ca2095418c3415acf6315cb24ae5cf0e9ffc29b9703595ee302b1466e56"});
export const GEOMETRY_SOURCE_ALIASES=Object.freeze([
  {
    "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H1",
    "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H1",
    "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
  },
  {
    "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H2",
    "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H2",
    "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
  },
  {
    "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H3",
    "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H3",
    "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
  },
  {
    "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V1",
    "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V1",
    "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
  },
  {
    "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V2",
    "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V2",
    "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
  },
  {
    "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V3",
    "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V3",
    "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
  }
]);
export const GEOMETRY_SOURCE_INTAKE_REVIEW=Object.freeze({"path":"共享接口/来源几何与对象三组交接/55534ca2095418c3/独立接入审阅.json","bytes":61433,"sha256":"cc2e88b975a94891553b0d509709c228b03fb8ac6b3bc23d2f728f4a173a13df","check_count":52,"scope":"post_freeze_read_only_contract_review_not_one_of_72_source_files"});
export const GEOMETRY_SOURCE_CATALOG=Object.freeze([
  {
    "schema_version": "0.1.read-only-source-geometry",
    "group_id": "building_geometry_svf",
    "registration_id": "source-geometry:building_geometry_svf:065259814b0207775bed815faec04b59c42f89338d560d8a6445ea3f20f6fa2b",
    "source_group": {
      "group_id": "building_geometry_svf",
      "title": "固定建筑背景的几何天空可视",
      "source_roots": [
        "共享接口/微观试验准备/建筑几何天空可视核查_20261006",
        "共享接口/来源几何与对象三组交接/建筑显示准备"
      ],
      "source_files": [
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/OBJ与来源对象部件关联.csv",
          "bytes": 20874,
          "sha256": "21eba896a34728e8246e09f22f886d182f585129ee3da627318119bbda3b6b9d",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/README.md",
          "bytes": 10108,
          "sha256": "500471b380403171579a4b628d5b513d23ba5621802a7fcb00839d529bfce800",
          "role": "source_material",
          "format": "md"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/requirements_已运行版本.txt",
          "bytes": 162,
          "sha256": "2a19aff4ac432ff16c7e2a89242b0aaffeae84e22fd520f49451fa3c534d4108",
          "role": "source_material",
          "format": "txt"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/交付schema.json",
          "bytes": 21646,
          "sha256": "2a81f68d379d90b3923df24e67b674c1d54bde9f582e8d52f9283cf482c9c6c1",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/交付文件清单.json",
          "bytes": 11320,
          "sha256": "8c245fce9da151c2da666a7f8cf8817f8b3bc5086eaf9a3636785acf396872ff",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六候选受体_几何SVF.geojson",
          "bytes": 4517,
          "sha256": "8a45374632b69415dd85f186f26df4e686e919ea9635dbd876e0f42484786dce",
          "role": "source_material",
          "format": "geojson"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六候选受体坐标关联.csv",
          "bytes": 1846,
          "sha256": "b86410abb20c4c6dc6f5435c9a08ce5ed7010d60b2d55896f29b60896b5322a3",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六点建筑几何SVF_四级采样.csv",
          "bytes": 5367,
          "sha256": "25c6bc2c2ed799955a8b3cf85413c888fcffb6c437363a9961b6367c2c482071",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六点逐方位建筑地平线.png",
          "bytes": 446578,
          "sha256": "f7106ae2131df574080e906304ff68d0da9bbd190641377b29b2f28188c7b54e",
          "role": "source_material",
          "format": "png"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六点逐方位建筑地平线.svg",
          "bytes": 100286,
          "sha256": "cc2fece45c25cc24732288fbe40f3badbb704bc555df7cb7466779cd9e5c7a6b",
          "role": "source_material",
          "format": "svg"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六点逐方位遮挡与来源.csv",
          "bytes": 17227027,
          "sha256": "97b29c3842aed8f181433c4989368f647f6d35877d326b3ccb6839f229177411",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/图件实际审阅.json",
          "bytes": 1259,
          "sha256": "437e6b053e1655d98e25863d6fb30bf3e65002de1eb3865cfc2eaa2d4c1c0d3c",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/坐标与水平面SVF契约.json",
          "bytes": 2525,
          "sha256": "0c82ac8c4fe085ab7c4972db37b0619695a29c25e5e58d2a1e28a7dc69c4ab77",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/建筑源与候选受体_几何核查.gpkg",
          "bytes": 241664,
          "sha256": "741648e3ee8ab7953ee303bacfa0de8389aa31ad8df3a3b7c01d31a89649b2f3",
          "role": "source_material",
          "format": "gpkg"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/方向加密差异.csv",
          "bytes": 2142,
          "sha256": "e5a4586013fb258a1a19756cf8cdcdd0fa652615346770106af2e4b542918d08",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/方向加密核查.png",
          "bytes": 100488,
          "sha256": "54844703ec750f3e6c63d2bbfa1f6ee21ae3f55d60f129c4f1d8d214bb2d4c1e",
          "role": "source_material",
          "format": "png"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/方向加密核查.svg",
          "bytes": 19583,
          "sha256": "710b3588ac325b0dbbd55b85fb1ceadb6210400e3f84cb18db605a9bead60d52",
          "role": "source_material",
          "format": "svg"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/本组重复数值一致核查.json",
          "bytes": 1383,
          "sha256": "35767fdd6ba6d573e03037694fc59f3702fbdae8a4e0b74c883464fd511bbb1a",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/本组重执行前数值指纹.json",
          "bytes": 531,
          "sha256": "6a407f1c5d17f66075c53412a2d797ea69a7321faa8a50625f720ea4fa841724",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/来源与生产核查.json",
          "bytes": 9050,
          "sha256": "15bf14187ae7a5a37c334c07336046b0fae80f04b51cefded703dba7a841abcf",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/来源字段与单位核查.json",
          "bytes": 3988,
          "sha256": "53fe9089e3b0ef903ffaa94aa43f768565345463868bcbd50c64524b34f09cc8",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/来源建筑与六点_几何SVF.png",
          "bytes": 584603,
          "sha256": "e96fc55d24d10ee33f133f754f13bb4b65ca34dae19a048aed79c11e75af1047",
          "role": "source_material",
          "format": "png"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/来源建筑与六点_几何SVF.svg",
          "bytes": 301819,
          "sha256": "e427d1a9f0544c97b5cb4de9e0da0d5ec36dffaab080b58cfc687472732df97c",
          "role": "source_material",
          "format": "svg"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/独立回读核查.json",
          "bytes": 55615,
          "sha256": "2641e99a1241c138040c36de95b10a3e3794377941479f0e6932db31ead73172",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/独立回读核查.py",
          "bytes": 17097,
          "sha256": "f22bf41c91f70522194c67f5dfef663b5f369b67bcfe41077c51094bcca74c0e",
          "role": "source_material",
          "format": "py"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/生产建筑几何天空可视.py",
          "bytes": 33228,
          "sha256": "cdd2d720eec4b7a5a6a107c63416e0cf038ec8f8ed178ed4921822fe5b413fbc",
          "role": "source_material",
          "format": "py"
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/解析与边界小例结果.json",
          "bytes": 5256,
          "sha256": "edc6b740eaf2c508efe412f5483b95f4fc6adef9674aeaa85b5529c45a670a0c",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/来源几何与对象三组交接/建筑显示准备/完整来源建筑_WGS84.geojson",
          "bytes": 636885,
          "sha256": "7986cbd02ade35b688373f822ca6f9eed866d8f32c0c5383e88f7a037628a9ae",
          "role": "source_material",
          "format": "geojson"
        },
        {
          "path": "共享接口/来源几何与对象三组交接/建筑显示准备/建筑显示准备及回读.json",
          "bytes": 865,
          "sha256": "492c4e24e77db288c3d6c09de8500410144d2ba7b75dae62deb6b4bde0ee5bfd",
          "role": "source_material",
          "format": "json"
        }
      ],
      "primary_tables": [
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/OBJ与来源对象部件关联.csv",
          "rows": 54,
          "column_count": 19,
          "columns": [
            "source_part_key",
            "source_object_key",
            "merged_id",
            "part_index",
            "OBJ_object",
            "vertex_count",
            "triangle_count",
            "source_ring_unique_XY_count",
            "OBJ_unique_XY_count",
            "max_XY_association_error_m",
            "max_Z_base_or_top_error_m",
            "working_top_z_m",
            "OBJ_min_z_m",
            "OBJ_max_z_m",
            "source_full_part_area_m2",
            "OBJ_signed_volume_m3",
            "source_prism_volume_m3",
            "all_edges_incidence_two",
            "source_consistency_passed"
          ],
          "primary_key_columns": [
            "source_part_key"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六候选受体坐标关联.csv",
          "rows": 6,
          "column_count": 19,
          "columns": [
            "receptor_key",
            "receptor_id",
            "grid_id",
            "UTM_E_m",
            "UTM_N_m",
            "OBJ_local_X_m",
            "OBJ_local_Y_m",
            "work_z_m",
            "source_proposed_air_height_m",
            "accepted_receiver_height_m",
            "accepted_ground_elevation_m",
            "position_and_height_confirmed",
            "inside_source_core",
            "outside_all_source_buildings",
            "CSV_GPKG_max_XY_difference_m",
            "source_region",
            "access_and_ground_surface",
            "measurement_status",
            "physical_scene_adopted"
          ],
          "primary_key_columns": [
            "receptor_key"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六点建筑几何SVF_四级采样.csv",
          "rows": 24,
          "column_count": 15,
          "columns": [
            "receptor_key",
            "receptor_id",
            "sampling_N",
            "azimuth_step_deg",
            "horizontal_building_SVF",
            "unweighted_sky_solid_angle_fraction_diagnostic",
            "no_above_horizon_building_direction_fraction_diagnostic",
            "max_horizon_elevation_deg",
            "mean_horizon_elevation_deg_diagnostic",
            "source_building_object_count",
            "source_building_part_count",
            "work_receiver_z_m",
            "accepted_receiver_height_m",
            "accepted_physical_SVF",
            "physical_scene_adopted"
          ],
          "primary_key_columns": [
            "receptor_key",
            "sampling_N"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六点逐方位遮挡与来源.csv",
          "rows": 32400,
          "column_count": 20,
          "columns": [
            "receptor_key",
            "receptor_id",
            "sampling_N",
            "direction_index_0based",
            "azimuth_deg_grid_north_clockwise",
            "horizon_elevation_rad",
            "horizon_elevation_deg",
            "horizontal_SVF_integrand_cos2",
            "winning_building_merged_id",
            "winning_source_object_key",
            "winning_source_part_key",
            "winning_part_index",
            "winning_entry_distance_m",
            "winning_work_top_z_m",
            "winning_entry_UTM_E_m",
            "winning_entry_UTM_N_m",
            "all_tied_max_source_part_keys_json",
            "intersected_source_part_count",
            "ray_length_beyond_all_source_bounds_m",
            "work_receiver_z_m"
          ],
          "primary_key_columns": [
            "receptor_key",
            "sampling_N",
            "direction_index_0based"
          ],
          "json_coded_columns": [
            "all_tied_max_source_part_keys_json"
          ],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/微观试验准备/建筑几何天空可视核查_20261006/方向加密差异.csv",
          "rows": 18,
          "column_count": 9,
          "columns": [
            "receptor_id",
            "coarse_N",
            "fine_N",
            "coarse_SVF",
            "fine_SVF",
            "signed_fine_minus_coarse",
            "absolute_difference",
            "a_posteriori_sampling_difference_not_error_bound",
            "domain_or_physical_accuracy_converged"
          ],
          "primary_key_columns": [
            "receptor_id",
            "coarse_N",
            "fine_N"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        }
      ],
      "display_geojson": [
        "共享接口/微观试验准备/建筑几何天空可视核查_20261006/六候选受体_几何SVF.geojson",
        "共享接口/来源几何与对象三组交接/建筑显示准备/完整来源建筑_WGS84.geojson"
      ],
      "source_claims": {
        "source_buildings": 53,
        "source_parts": 54,
        "candidate_points": 6,
        "SVF_records": 24,
        "direction_records": 32400,
        "analytical_cases": 15,
        "analytical_passed": 14,
        "exact_tangent_case_failures_retained": 1,
        "independent_readback_checks": 311,
        "physical_scene_adopted": null,
        "accepted_physical_SVF": null,
        "MRT_air_temperature_UTCI_or_cooling": null
      },
      "intake_status": "source_review_with_explicit_limits",
      "scientific_adoption_opened": false
    },
    "manifest_source": {
      "path": "平台产品设计/来源几何与对象三组接入清单_20261006.json",
      "bytes": 47045,
      "sha256": "55534ca2095418c3415acf6315cb24ae5cf0e9ffc29b9703595ee302b1466e56"
    },
    "archive": {
      "bytes": 3408939,
      "sha256": "3a55bcfc234bb95b8b44a74079d18842b20cfc672f3887dd5eebad106872e09e"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-06T02:42:39.025Z",
      "file_acceptance": "verified_72_source_bytes_and_original_manifest",
      "science_validation": "source_geometry_review_with_retained_failures_not_physical_adoption",
      "integration": "read_only_geometry_and_source_objects",
      "execution": "source_metadata_verified_no_producer_or_research_run",
      "readonly_contract_review": {
        "path": "共享接口/来源几何与对象三组交接/55534ca2095418c3/独立接入审阅.json",
        "bytes": 61433,
        "sha256": "cc2e88b975a94891553b0d509709c228b03fb8ac6b3bc23d2f728f4a173a13df",
        "check_count": 52,
        "scope": "post_freeze_read_only_contract_review_not_one_of_72_source_files"
      },
      "receiver_key_aliases": [
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H1",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H1",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H2",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H2",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H3",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H3",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V1",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V1",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V2",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V2",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V3",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V3",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        }
      ],
      "application_gates": {
        "new_site_prediction": false,
        "physical_simulation": false,
        "thermal_comfort": false,
        "routing_or_OD": false,
        "actual_access_or_use_service": false,
        "fairness": false,
        "minimum_green_area": false,
        "candidate_generation": false,
        "ranking": false
      }
    }
  },
  {
    "schema_version": "0.1.read-only-source-geometry",
    "group_id": "window_source_connectivity",
    "registration_id": "source-geometry:window_source_connectivity:37e5abedcc3e4b232be626e8f7e14648ecc032dfc52759111e99ddedb9cec0ff",
    "source_group": {
      "group_id": "window_source_connectivity",
      "title": "准备窗与完整来源线的范围差异",
      "source_roots": [
        "共享接口/服务链准备/窗口与源连通范围诊断_20261006",
        "共享接口/来源几何与对象三组交接/窗内外显示准备"
      ],
      "source_files": [
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/README.md",
          "bytes": 9527,
          "sha256": "cfc67df501ebb36395f1f7ffb3ae7a36ab4c6ba11bf6a6383fcda4268c059041",
          "role": "source_material",
          "format": "md"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/交付回读.json",
          "bytes": 12176,
          "sha256": "bd89d4f351aa41d3525b0d1f282cc5e8d9bdcd86e8dfdfdf9cce74538f667d80",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/来源图样式与身份.json",
          "bytes": 2711,
          "sha256": "4d9b3432d943a0bbf2589841c23ae471bfaf9636c9d77447ff106273be134a2d",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/派生节点与原身份.csv",
          "bytes": 105439,
          "sha256": "705ba4b83a09e94a1f772b9e5944aeff648df31a00e9a3c5c566f95c08db7bb0",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/独立范围回读.py",
          "bytes": 14624,
          "sha256": "8f8db8fa7270eaf75aeb6a79b193ed6120c6d061aa271623a975bb57b25fd2a6",
          "role": "source_material",
          "format": "py"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/独立范围核查.json",
          "bytes": 49606,
          "sha256": "e5912232dcfdd39af1e6fd4b87e19ce61dad4279f36baca4e0b6b9c464ac9a96",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/独立范围核查_首次精确等价失败.json",
          "bytes": 33937,
          "sha256": "7ab93b1f2b9cd849f4b53b6ad78096fb5880e55b0a5a39babe22c27dc4f897f1",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/生成窗口来源诊断.py",
          "bytes": 24645,
          "sha256": "a232c087d863dc5b2f03ea1873260f39c8cdae1e7fd258d5ebf53bf33530db38",
          "role": "source_material",
          "format": "py"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗内派生原段.csv",
          "bytes": 45269,
          "sha256": "8955e75afd66c362545015deec30eeeabf1495e4884e6c5084278507f3b89220",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗口与源连通范围核查.json",
          "bytes": 10352,
          "sha256": "66e085b898eb41ff46c585ca6c470307c605999c0772172a318e905556a008ff",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗口与窗外源支撑核对.png",
          "bytes": 345303,
          "sha256": "051759ccf3ad6646e4a3e757cff53621ca6f87d5070eeb0699974bf8d8f20f43",
          "role": "source_material",
          "format": "png"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗外分量连接支撑.csv",
          "bytes": 15051,
          "sha256": "f2e38fa1c87fc6caa92c02585da9547835ad547789748fb2c5c15353c9373d60",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗外来源支撑段.csv",
          "bytes": 53278,
          "sha256": "0ddbabec7e5f3f7562df66ff3c74c35e25d75e705e7b4069fb3ad58363e99d60",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗界位置与分量关系.csv",
          "bytes": 6025,
          "sha256": "4c70e6f27f1870d94c885c8e5110d3d7b3111a85d836a486e1d29d32a7595125",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/绘制来源范围图.py",
          "bytes": 9176,
          "sha256": "17576a84e0386e0ada0793f4d83e81603f18b8990b818d9fe5b31c0270333c54",
          "role": "source_material",
          "format": "py"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/跨窗分量共同源节点证据.csv",
          "bytes": 2395,
          "sha256": "010b21e90cfe14d9d8cff6cbfd55c7ee53b3c0cc8c2d788b25db7ec8212669e4",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/逐way保存几何长度核对.csv",
          "bytes": 4288,
          "sha256": "3ff8e775f34578788b05cc34f6276fe00273868809861bb5903a9440e9c40f0b",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/逐原段裁切记录.csv",
          "bytes": 41841,
          "sha256": "dcc8035d759d41dcfaf95df6a4ad27f93f94d1faf57a83e2f4b9d24b571d4edc",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/来源几何与对象三组交接/窗内外显示准备/原节点及裁切点_WGS84.geojson",
          "bytes": 285764,
          "sha256": "5ab11939bd8acf8bef1130ae8762bc7c2953ce3d83f833318c16b22562511d81",
          "role": "source_material",
          "format": "geojson"
        },
        {
          "path": "共享接口/来源几何与对象三组交接/窗内外显示准备/显示准备及回读.json",
          "bytes": 2068,
          "sha256": "bfa7fca6660122317f094cc45ae1fd97ecbbe991989e4ececc2bae6dd1737e2b",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/来源几何与对象三组交接/窗内外显示准备/窗内来源片段_WGS84.geojson",
          "bytes": 159865,
          "sha256": "67075e8dad470a22f22e6d23a08a2d51889621087f2430fb52779c141bd43d0f",
          "role": "source_material",
          "format": "geojson"
        },
        {
          "path": "共享接口/来源几何与对象三组交接/窗内外显示准备/窗外来源片段_WGS84.geojson",
          "bytes": 188620,
          "sha256": "fbc27dce4280705ab2c0cc8145bb2e52ffcc04074408ce8ccdee8cafe78e2d54",
          "role": "source_material",
          "format": "geojson"
        }
      ],
      "primary_tables": [
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/派生节点与原身份.csv",
          "rows": 92,
          "column_count": 18,
          "columns": [
            "derived_node_key",
            "derived_namespace",
            "node_kind",
            "source_node_key",
            "source_osm_node_id",
            "x_m",
            "y_m",
            "geometry_crs",
            "on_context_boundary_exact",
            "inside_or_on_context",
            "parent_source_segment_keys_json",
            "clip_only_source_parameters_json",
            "boundary_display_label",
            "inside_component_id",
            "outside_component_id",
            "full_partition_component_id",
            "public_walk_node_verified",
            "same_grade_verified"
          ],
          "primary_key_columns": [
            "derived_node_key"
          ],
          "json_coded_columns": [
            "parent_source_segment_keys_json",
            "clip_only_source_parameters_json"
          ],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗内派生原段.csv",
          "rows": 45,
          "column_count": 26,
          "columns": [
            "derived_segment_key",
            "derived_namespace",
            "side",
            "parent_source_segment_key",
            "source_way_key",
            "source_feature_id",
            "parent_source_segment_index_0based",
            "fragment_index_0based",
            "from_derived_node_key",
            "to_derived_node_key",
            "geometry_crs",
            "geometry_wkt",
            "fragment_length_m",
            "source_linear_start_0_to_1",
            "source_linear_end_0_to_1",
            "highway_raw",
            "foot_raw",
            "access_raw",
            "bridge_raw",
            "tunnel_raw",
            "layer_raw",
            "source_component_id_before_clip",
            "derived_side_component_id",
            "legal_walk_connection",
            "legal_walk_state",
            "route_or_service_run"
          ],
          "primary_key_columns": [
            "derived_segment_key"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗外分量连接支撑.csv",
          "rows": 8,
          "column_count": 13,
          "columns": [
            "outside_component_id",
            "derived_namespace",
            "outside_fragment_count",
            "outside_length_m",
            "outside_fragment_keys_json",
            "source_way_keys_json",
            "boundary_node_keys_json",
            "boundary_display_labels_json",
            "touching_inside_component_ids_json",
            "touching_inside_component_count",
            "bridges_different_inside_source_components",
            "interpretation",
            "legal_access_verified"
          ],
          "primary_key_columns": [
            "outside_component_id"
          ],
          "json_coded_columns": [
            "outside_fragment_keys_json",
            "source_way_keys_json",
            "boundary_node_keys_json",
            "boundary_display_labels_json",
            "touching_inside_component_ids_json"
          ],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗外来源支撑段.csv",
          "rows": 53,
          "column_count": 26,
          "columns": [
            "derived_segment_key",
            "derived_namespace",
            "side",
            "parent_source_segment_key",
            "source_way_key",
            "source_feature_id",
            "parent_source_segment_index_0based",
            "fragment_index_0based",
            "from_derived_node_key",
            "to_derived_node_key",
            "geometry_crs",
            "geometry_wkt",
            "fragment_length_m",
            "source_linear_start_0_to_1",
            "source_linear_end_0_to_1",
            "highway_raw",
            "foot_raw",
            "access_raw",
            "bridge_raw",
            "tunnel_raw",
            "layer_raw",
            "source_component_id_before_clip",
            "derived_side_component_id",
            "legal_walk_connection",
            "legal_walk_state",
            "route_or_service_run"
          ],
          "primary_key_columns": [
            "derived_segment_key"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/窗界位置与分量关系.csv",
          "rows": 11,
          "column_count": 15,
          "columns": [
            "boundary_node_key",
            "boundary_display_label",
            "node_kind",
            "source_node_key",
            "source_osm_node_id",
            "x_m",
            "y_m",
            "geometry_crs",
            "parent_source_segment_keys_json",
            "inside_component_id",
            "outside_component_id",
            "full_partition_component_id",
            "public_entrance_id",
            "legal_crossing_verified",
            "relation_semantics"
          ],
          "primary_key_columns": [
            "boundary_node_key"
          ],
          "json_coded_columns": [
            "parent_source_segment_keys_json"
          ],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/跨窗分量共同源节点证据.csv",
          "rows": 1,
          "column_count": 13,
          "columns": [
            "original_node_reference_key",
            "source_node_key",
            "source_osm_node_id",
            "x_m",
            "y_m",
            "geometry_crs",
            "inside_or_on_context",
            "source_point_distance_to_context_m",
            "outside_component_id",
            "touching_inside_component_ids_json",
            "direct_original_fragment_evidence_json",
            "evidence_kind",
            "public_walk_or_grade_certified"
          ],
          "primary_key_columns": [
            "original_node_reference_key"
          ],
          "json_coded_columns": [
            "touching_inside_component_ids_json",
            "direct_original_fragment_evidence_json"
          ],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/逐way保存几何长度核对.csv",
          "rows": 17,
          "column_count": 10,
          "columns": [
            "source_way_key",
            "source_feature_id",
            "saved_GPKG_full_length_m",
            "sum_original_segment_length_m",
            "saved_GPKG_inside_length_m",
            "sum_derived_inside_length_m",
            "saved_GPKG_outside_length_m",
            "sum_derived_outside_length_m",
            "maximum_length_difference_m",
            "passed"
          ],
          "primary_key_columns": [
            "source_way_key"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/窗口与源连通范围诊断_20261006/逐原段裁切记录.csv",
          "rows": 87,
          "column_count": 19,
          "columns": [
            "parent_source_segment_key",
            "source_way_key",
            "source_feature_id",
            "source_segment_index_0based",
            "original_length_m",
            "inside_positive_length_m",
            "outside_positive_length_m",
            "length_closure_abs_error_m",
            "length_closure_tolerance_m",
            "length_closure_passed",
            "inside_geometry_type",
            "inside_geometry_wkt",
            "outside_geometry_type",
            "outside_geometry_wkt",
            "inside_positive_fragment_count",
            "outside_positive_fragment_count",
            "boundary_intersection_wkt",
            "clipped_for_review_only",
            "planar_intersections_noded"
          ],
          "primary_key_columns": [
            "parent_source_segment_key"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        }
      ],
      "display_geojson": [
        "共享接口/来源几何与对象三组交接/窗内外显示准备/窗内来源片段_WGS84.geojson",
        "共享接口/来源几何与对象三组交接/窗内外显示准备/窗外来源片段_WGS84.geojson",
        "共享接口/来源几何与对象三组交接/窗内外显示准备/原节点及裁切点_WGS84.geojson"
      ],
      "source_claims": {
        "full_source_components": 1,
        "inside_components": 2,
        "outside_components": 8,
        "original_nodes": 81,
        "boundary_cut_points": 11,
        "inside_fragments": 45,
        "outside_fragments": 53,
        "exact_geometry_all_passed": false,
        "geometry_review_state": "floating_precision_qualified_strict_equals_failed",
        "numerical_identity_checks_passed": true,
        "retained_strict_failed_parent_segments": 11,
        "bridge_original_node": "3538911123",
        "bridge_node_distance_outside_south_window_m": 3.8410432166,
        "outside_component_length_m": 672.0242134200864,
        "outside_component_length_is_route_distance": false,
        "public_walk_or_routes_adopted": false
      },
      "intake_status": "source_review_with_explicit_limits",
      "scientific_adoption_opened": false
    },
    "manifest_source": {
      "path": "平台产品设计/来源几何与对象三组接入清单_20261006.json",
      "bytes": 47045,
      "sha256": "55534ca2095418c3415acf6315cb24ae5cf0e9ffc29b9703595ee302b1466e56"
    },
    "archive": {
      "bytes": 436626,
      "sha256": "1b95e13baa0b70f250adac63d64800b8ece3de3e33f203849746355b42dc3284"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-06T02:42:39.025Z",
      "file_acceptance": "verified_72_source_bytes_and_original_manifest",
      "science_validation": "source_geometry_review_with_retained_failures_not_physical_adoption",
      "integration": "read_only_geometry_and_source_objects",
      "execution": "source_metadata_verified_no_producer_or_research_run",
      "readonly_contract_review": {
        "path": "共享接口/来源几何与对象三组交接/55534ca2095418c3/独立接入审阅.json",
        "bytes": 61433,
        "sha256": "cc2e88b975a94891553b0d509709c228b03fb8ac6b3bc23d2f728f4a173a13df",
        "check_count": 52,
        "scope": "post_freeze_read_only_contract_review_not_one_of_72_source_files"
      },
      "receiver_key_aliases": [
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H1",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H1",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H2",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H2",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H3",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H3",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V1",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V1",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V2",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V2",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V3",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V3",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        }
      ],
      "application_gates": {
        "new_site_prediction": false,
        "physical_simulation": false,
        "thermal_comfort": false,
        "routing_or_OD": false,
        "actual_access_or_use_service": false,
        "fairness": false,
        "minimum_green_area": false,
        "candidate_generation": false,
        "ranking": false
      }
    }
  },
  {
    "schema_version": "0.1.read-only-source-geometry",
    "group_id": "OSM_source_marks",
    "registration_id": "source-geometry:OSM_source_marks:e8a444a42bbd8cbdc295471ff0f23bba15bfee08129b294afdc16c4b353506f2",
    "source_group": {
      "group_id": "OSM_source_marks",
      "title": "入口与开放空间来源标记",
      "source_roots": [
        "共享接口/服务链准备/入口与开放空间来源标记_20261006"
      ],
      "source_files": [
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/01_空间提取.json",
          "bytes": 706,
          "sha256": "bcf4fa4a3eee695a40a120a014ba8f51b5ed5a77c317859242360dcb798b1965",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/02_原标签筛选.json",
          "bytes": 681,
          "sha256": "caa30c7c0d1d0b2e0b2dc80518f044f51706aab3748a8a8d8c71f2063d5f31d9",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/03_几何导出.json",
          "bytes": 600,
          "sha256": "4e06e51160cad3d32851e472aa686a9598ad0d450913638712ca2c4addc2f729",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/04_原件头信息.json",
          "bytes": 1245,
          "sha256": "8af2d23f2b35cf6b818e182fcc319e319b88b3a0f945d5df4258fda034edd660",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/README.md",
          "bytes": 4240,
          "sha256": "5ab2fceb32277b17315dbd8404eb77daa6824f09e3f150d9a7a65b2329093517",
          "role": "source_material",
          "format": "md"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/入口与开放空间来源标记.csv",
          "bytes": 6075,
          "sha256": "872ae0276407a0ed6eb474796580d4300fe56476694bada7457165e5fcd1827c",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/准备窗内来源标记_WGS84.geojson",
          "bytes": 14793,
          "sha256": "975b68d6912eae2b8744c8e1b3880b759e61dbf441786e786014f4263e1f9e61",
          "role": "source_material",
          "format": "geojson"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/准备窗包络_完整way与multipolygon.osm.pbf",
          "bytes": 6416,
          "sha256": "631873fbe40e889473e840458303380c66f81f0e5f4ce666b67009b5db1c9ca5",
          "role": "source_material",
          "format": "pbf"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/初始未接受字段版本/入口与开放空间来源标记.csv",
          "bytes": 5420,
          "sha256": "d61e532aabd8aeb1050f8a1ad6f40d5765422e34e0b4cf6864e4d715837900d4",
          "role": "retained_unaccepted_schema_history",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/初始未接受字段版本/准备窗内来源标记_WGS84.geojson",
          "bytes": 13992,
          "sha256": "996c0895080eff0de638e9b8a9c41b690fbef3a575a365618a1881ee5dad4235",
          "role": "retained_unaccepted_schema_history",
          "format": "geojson"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/初始未接受字段版本/提取范围与表达式.json",
          "bytes": 1110,
          "sha256": "f699db853cbd77ae6aa8029096da7353636be3ae009a367c4e0e8e78ca576855",
          "role": "retained_unaccepted_schema_history",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/初始未接受字段版本/来源提取与回读.json",
          "bytes": 5555,
          "sha256": "2504673224183df2e26716da247124253c111821b6555426cc205fed00774a02",
          "role": "retained_unaccepted_schema_history",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/原始对象独立核查.py",
          "bytes": 8850,
          "sha256": "8d0aa18ff88e299a4ec5dc7a898a326f09ceab62397e4214e6563e0d0163fe5f",
          "role": "source_material",
          "format": "py"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/唯一源对象及导出表示.csv",
          "bytes": 2667,
          "sha256": "913758d2b904339931792fa50c8cd93eb6c621c63e10d84663633d7cc9a70ce6",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/提取来源标记.py",
          "bytes": 16601,
          "sha256": "ba9dc9097e64704f1ed3d5eaf302b01d83d684a7dc9ad7b2797e6901b8e0c541",
          "role": "source_material",
          "format": "py"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/提取范围与表达式.json",
          "bytes": 1110,
          "sha256": "f699db853cbd77ae6aa8029096da7353636be3ae009a367c4e0e8e78ca576855",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/来源提取与回读.json",
          "bytes": 6903,
          "sha256": "ef2568fd10b62c1ccd67d409152ffce3873b47dbe63d66482ef365a5732a9b2e",
          "role": "source_material",
          "format": "json"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/来源标记_原始导出.geojson",
          "bytes": 2909,
          "sha256": "60fbd2f44b5bb3b972496a08397f4571aec7cd043e59a71df8433f1c3dbacaa9",
          "role": "source_material",
          "format": "geojson"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/来源标记与引用原件.osm.pbf",
          "bytes": 956,
          "sha256": "c94c0bed76de29085e4cf6311c390405e5a44780d3ba00a38b7bcf68140f06c6",
          "role": "source_material",
          "format": "pbf"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/源标记及候选受体与开放空间投影关系.csv",
          "bytes": 5285,
          "sha256": "d3d15df176a5f42b6d4cdb021bbade0cf3812224f4607e576609086e281032d6",
          "role": "source_material",
          "format": "csv"
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/独立来源标记核查.json",
          "bytes": 7648,
          "sha256": "71ec84a95fcfe8eb4b53db5a90835044013cb8da4233482825f38ea1a10b2bdc",
          "role": "source_material",
          "format": "json"
        }
      ],
      "primary_tables": [
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/入口与开放空间来源标记.csv",
          "rows": 5,
          "column_count": 31,
          "columns": [
            "source_mark_key",
            "source_feature_id",
            "source_object_key",
            "object_type",
            "object_id",
            "export_occurrence_0based",
            "source_version",
            "object_last_edit_raw_unix_seconds",
            "object_last_edit_utc",
            "mark_groups_json",
            "geometry_type",
            "geometry_crs",
            "geometry_wkt",
            "source_geometry_valid",
            "validity_reason",
            "context_relation",
            "raw_tags_json",
            "entrance_raw",
            "barrier_raw",
            "crossing_raw",
            "leisure_raw",
            "access_raw",
            "foot_raw",
            "opening_hours_raw",
            "existing81_source_node_key",
            "existing_source_way_ids_json",
            "actual_public_destination",
            "actual_entrance_role",
            "legal_public_access",
            "adopted_graph_connection",
            "service_or_thermal_value"
          ],
          "primary_key_columns": [
            "source_mark_key"
          ],
          "json_coded_columns": [
            "mark_groups_json",
            "raw_tags_json",
            "existing_source_way_ids_json"
          ],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/唯一源对象及导出表示.csv",
          "rows": 4,
          "column_count": 13,
          "columns": [
            "source_object_key",
            "object_type",
            "object_id",
            "source_version",
            "object_last_edit_raw_unix_seconds",
            "object_last_edit_utc",
            "mark_groups_json",
            "raw_tags_json",
            "actual_destination_or_entrance",
            "legal_public_access",
            "source_feature_keys_json",
            "geometry_types_json",
            "context_relations_json"
          ],
          "primary_key_columns": [
            "source_object_key"
          ],
          "json_coded_columns": [
            "mark_groups_json",
            "raw_tags_json",
            "source_feature_keys_json",
            "geometry_types_json",
            "context_relations_json"
          ],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        },
        {
          "path": "共享接口/服务链准备/入口与开放空间来源标记_20261006/源标记及候选受体与开放空间投影关系.csv",
          "rows": 9,
          "column_count": 13,
          "columns": [
            "relation_key",
            "subject_key",
            "subject_type",
            "area_source_object_key",
            "measurement_crs",
            "source_point_covered_by_area_projection",
            "source_projection_gap_m",
            "source_boundary_distance_m",
            "geometry_semantics",
            "actual_entrance_role",
            "legal_connection",
            "route_distance_m",
            "service_value"
          ],
          "primary_key_columns": [
            "relation_key"
          ],
          "json_coded_columns": [],
          "raw_CSV_empty_cells_preserved": true,
          "historical_unaccepted_schema": false
        }
      ],
      "display_geojson": [
        "共享接口/服务链准备/入口与开放空间来源标记_20261006/准备窗内来源标记_WGS84.geojson"
      ],
      "source_claims": {
        "unique_source_objects": 4,
        "source_geometry_representations": 5,
        "context_display_representations": 4,
        "context_unique_objects": 3,
        "open_space_source_objects": 1,
        "exact_existing_node_matches": 2,
        "point_park_projection_relations": 9,
        "independent_readback_passed": 55,
        "independent_readback_failed": 0,
        "initial_unaccepted_schema_files_retained": 4,
        "complete_real_entrance_inventory_verified": false,
        "destination_entrance_legal_graph_or_service_adopted": false
      },
      "intake_status": "source_review_with_explicit_limits",
      "scientific_adoption_opened": false
    },
    "manifest_source": {
      "path": "平台产品设计/来源几何与对象三组接入清单_20261006.json",
      "bytes": 47045,
      "sha256": "55534ca2095418c3415acf6315cb24ae5cf0e9ffc29b9703595ee302b1466e56"
    },
    "archive": {
      "bytes": 59470,
      "sha256": "c20ce1cce8097f124c62df4d1a9f5a4e4f64ad6c0ea459400a67a497aff055dc"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-06T02:42:39.025Z",
      "file_acceptance": "verified_72_source_bytes_and_original_manifest",
      "science_validation": "source_geometry_review_with_retained_failures_not_physical_adoption",
      "integration": "read_only_geometry_and_source_objects",
      "execution": "source_metadata_verified_no_producer_or_research_run",
      "readonly_contract_review": {
        "path": "共享接口/来源几何与对象三组交接/55534ca2095418c3/独立接入审阅.json",
        "bytes": 61433,
        "sha256": "cc2e88b975a94891553b0d509709c228b03fb8ac6b3bc23d2f728f4a173a13df",
        "check_count": 52,
        "scope": "post_freeze_read_only_contract_review_not_one_of_72_source_files"
      },
      "receiver_key_aliases": [
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H1",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H1",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H2",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H2",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H3",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/H3",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V1",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V1",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V2",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V2",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        },
        {
          "source_mark_relation_subject_key": "micro_scene@sha256:6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V3",
          "SVF_receptor_key": "6e852b128a3378dbe314b06885eec45a683387cf3c99ccda9bedc2b0a740a4f4/receptor_candidates/V3",
          "binding_basis": "same full SHA256, receptor_candidates layer, original ID; explicit prefix alias, not bare-ID matching"
        }
      ],
      "application_gates": {
        "new_site_prediction": false,
        "physical_simulation": false,
        "thermal_comfort": false,
        "routing_or_OD": false,
        "actual_access_or_use_service": false,
        "fairness": false,
        "minimum_green_area": false,
        "candidate_generation": false,
        "ranking": false
      }
    }
  }
]);
