// Independent frozen source-preparation registrations; source claims are preserved.
export const SOURCE_PREPARATION_CATALOG=Object.freeze([
  {
    "schema_version": "0.1.source-preparation-registration",
    "group_id": "micro-source-overlay",
    "registration_id": "source-preparation:micro-source-overlay:f4b7ae449354aee9efa295aadf2b14eb4e6175e95a3aa1bb995d08d54676be1c",
    "source_group": {
      "group_id": "micro-source-overlay",
      "title": "核心范围来源与重复计面积",
      "source_folder": "共享接口/微观试验准备/研究范围来源叠合_20261006",
      "schema_version": "0.1.read-only-source-preparation",
      "source_set_sha256": "f4b7ae449354aee9efa295aadf2b14eb4e6175e95a3aa1bb995d08d54676be1c",
      "registration_id": "source-preparation:micro-source-overlay:f4b7ae449354aee9efa295aadf2b14eb4e6175e95a3aa1bb995d08d54676be1c",
      "file_count": 16,
      "files": [
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/README.md",
          "bytes": 6713,
          "sha256": "f4316011f9bb37234b1c758b12daf10c41e34b3f6c1b2d318968f75e2f760951",
          "role": "source_preparation_read_only",
          "file_kind": "md"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/build_source_scope_overlay.py",
          "bytes": 40613,
          "sha256": "e024ca6cd28301a7de2d6c4153076427c785968a85a240a835a5b2a5bd2d3381",
          "role": "source_preparation_read_only",
          "file_kind": "py"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/分区与源对象正面积关系.csv",
          "bytes": 8360,
          "sha256": "52478e3b638004efd4af1a9e18fac0b95db2621642ce958c3528eb75c9a11783",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 41,
          "columns": [
            "cell_id",
            "source_key",
            "layer",
            "area_m2",
            "assignment_type"
          ],
          "column_count": 5,
          "primary_key_columns": [
            "cell_id",
            "source_key"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/分区闭合与来源.csv",
          "bytes": 8486,
          "sha256": "d968ffbe4138c9d7cbb3d964197dfc7fdebb1b13c0170e5f0b1150f2c235ba5e",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 16,
          "columns": [
            "cell_id",
            "source_category",
            "source_category_label",
            "area_m2",
            "source_keys_json",
            "layer_keys_json",
            "native_geometry_sha256",
            "research_action_adopted",
            "accepted_ground_or_road_surface",
            "implementation_permission"
          ],
          "column_count": 10,
          "primary_key_columns": [
            "cell_id"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/来源叠合分区_UTM48N.gpkg",
          "bytes": 151552,
          "sha256": "aaf47c47ed9518c9ee1efbef3417439dc60ae1cc76631915abca9b157ed55846",
          "role": "source_preparation_read_only",
          "file_kind": "gpkg"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/来源叠合分区_WGS84.geojson",
          "bytes": 46162,
          "sha256": "2daeab7a514e09d9e3114b32116a587abceb53e8f5532181ff7cd0754cf3a43d",
          "role": "source_preparation_read_only",
          "file_kind": "geojson",
          "feature_count": 16,
          "top_level_keys": [
            "type",
            "analysis_crs",
            "coordinate_crs",
            "area_and_length_units",
            "adoption_state",
            "features"
          ],
          "coordinate_crs": "EPSG:4326 longitude_latitude",
          "analysis_crs": "EPSG:32648",
          "source_properties": [
            "cell_id",
            "source_category",
            "source_category_label",
            "area_m2",
            "source_keys_json",
            "layer_keys_json",
            "native_geometry_sha256",
            "research_action_adopted",
            "accepted_ground_or_road_surface",
            "implementation_permission"
          ],
          "geometry_use": "source_display_only_native_UTM_geometry_and_recorded_m2_or_m_are_authoritative"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/核心来源闭合与线性支持.png",
          "bytes": 689842,
          "sha256": "83eaf73639f488a3a0d5ac7d78733bbebfeca774dd349eb66987c9fd62a257ad",
          "role": "source_preparation_read_only",
          "file_kind": "png"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/核心来源闭合与线性支持.svg",
          "bytes": 504071,
          "sha256": "432f68f2370711865cf3616558fef5d2585132e95d3ad5e14c959912af82cb62",
          "role": "source_preparation_read_only",
          "file_kind": "svg"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/核心来源闭合与线性支持_灰度审阅.png",
          "bytes": 336085,
          "sha256": "bf68cadf12707a493c4f5580e097d6da20aaecc5dec95aef5b44cda7c4535e2a",
          "role": "source_preparation_read_only",
          "file_kind": "png"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/核查记录.json",
          "bytes": 34806,
          "sha256": "d32f3d031dca48f60510af640bcd143cd437e4080af391b23a0f1226cb644eab",
          "role": "source_preparation_read_only",
          "file_kind": "json"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/根独立几何回读核查.json",
          "bytes": 11087,
          "sha256": "7219d18ec86f2ec921b26e6423b159bc878b249f4200b16f79bd545ba5c4be83",
          "role": "source_preparation_read_only",
          "file_kind": "json"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/源对象几何审阅.csv",
          "bytes": 31720,
          "sha256": "5181a72c25d4481ebecc3a28258ac8d530fcf59c2b231c7e1e1038f501730eb0",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 132,
          "columns": [
            "source_key",
            "layer",
            "object_id",
            "fid",
            "source_geometry_type",
            "source_valid",
            "source_exact_normalized_wkb_sha256",
            "core_support_relation",
            "accepted_retention_rule",
            "accepted_exclusion_rule",
            "accepted_physical_surface",
            "implementation_permission"
          ],
          "column_count": 12,
          "primary_key_columns": [
            "source_key"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/研究动作提案_未采用.json",
          "bytes": 1249,
          "sha256": "9c1952f9c117b2bf5717c2ffe8a52f2d7b9b608ec9a03a1dd5e2cc6682e53b66",
          "role": "source_preparation_read_only",
          "file_kind": "json"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/跨层正面积交叠关系.csv",
          "bytes": 671,
          "sha256": "fa4d8ed44ac9924b018237fe587797c2dd5aa26bdf61cf672a2acdba9f9fb10b",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 2,
          "columns": [
            "first_source_key",
            "second_source_key",
            "overlap_area_m2",
            "interpretation",
            "accepted_physical_cause",
            "accepted_use_or_action"
          ],
          "column_count": 6,
          "primary_key_columns": [
            "first_source_key",
            "second_source_key"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/道路分区线支持.csv",
          "bytes": 2679,
          "sha256": "84a30ccc85038a6e983651e43928117beefdf88b1a0f8716289a47ab07b0a38e",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 12,
          "columns": [
            "source_key",
            "source_layer",
            "source_object_id",
            "cell_id",
            "source_category",
            "line_support_length_m",
            "line_has_area_m2",
            "road_width_accepted_m",
            "road_area_allocated_m2",
            "research_day_snapshot_adopted",
            "implementation_permission"
          ],
          "column_count": 11,
          "primary_key_columns": [
            "source_key",
            "cell_id"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/微观试验准备/研究范围来源叠合_20261006/道路分区线支持_WGS84.geojson",
          "bytes": 8647,
          "sha256": "dec3c006f38d577b9b42208713c47b111b676de4d0869b445c9f5e43e3be666d",
          "role": "source_preparation_read_only",
          "file_kind": "geojson",
          "feature_count": 12,
          "top_level_keys": [
            "type",
            "analysis_crs",
            "coordinate_crs",
            "area_and_length_units",
            "adoption_state",
            "features"
          ],
          "coordinate_crs": "EPSG:4326 longitude_latitude",
          "analysis_crs": "EPSG:32648",
          "source_properties": [
            "source_key",
            "source_layer",
            "source_object_id",
            "cell_id",
            "source_category",
            "line_support_length_m",
            "line_has_area_m2",
            "road_width_accepted_m",
            "road_area_allocated_m2",
            "research_day_snapshot_adopted",
            "implementation_permission"
          ],
          "geometry_use": "source_display_only_native_UTM_geometry_and_recorded_m2_or_m_are_authoritative"
        }
      ],
      "scientific_adoption": "not_adopted",
      "software_intake": "not_yet_executed",
      "area_D_physical_access_fairness_ranking_outputs_available": false
    },
    "manifest_source": {
      "path": "平台产品设计/来源准备三组接入清单_20261006.json",
      "bytes": 35509,
      "sha256": "4fbe5e23e47436869fbd78fc74741e5bbeb60a4017c73001b1b7583d7a1c8860"
    },
    "archive": {
      "bytes": 1169830,
      "sha256": "cc1c92686328a7f2ffdccdd519b91d0cf90aa50fa3f2e9a226dc80b766c6ce8f"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-05T22:11:05.777Z",
      "file_acceptance": "verified_31_source_bytes_and_original_manifest",
      "science_validation": "source_preparation_not_adopted",
      "integration": "read_only_source_review",
      "execution": "source_metadata_verified_no_producer_or_research_run",
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
    "schema_version": "0.1.source-preparation-registration",
    "group_id": "weather-cross-format",
    "registration_id": "source-preparation:weather-cross-format:866955f10fb704ffbb51819f67968918fd0c714f6e990598c08b56e602206bd6",
    "source_group": {
      "group_id": "weather-cross-format",
      "title": "天气表示与引擎输入待核项",
      "source_folder": "共享接口/微观试验准备/天气跨格式试核_20261006",
      "schema_version": "0.1.read-only-source-preparation",
      "source_set_sha256": "866955f10fb704ffbb51819f67968918fd0c714f6e990598c08b56e602206bd6",
      "registration_id": "source-preparation:weather-cross-format:866955f10fb704ffbb51819f67968918fd0c714f6e990598c08b56e602206bd6",
      "file_count": 6,
      "files": [
        {
          "path": "共享接口/微观试验准备/天气跨格式试核_20261006/07月19日跨格式逐小时对照.csv",
          "bytes": 9207,
          "sha256": "1529aedc5baa034b2cf0ffc140a88e2fac2abaecb4dea8e73d3673fd91de2dcc",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 24,
          "columns": [
            "weather_scenario_id",
            "epw_record_1based",
            "epw_text_line_1based",
            "wea_text_line_1based",
            "clm_text_line_1based",
            "rain_text_line_1based",
            "literal_epw_year",
            "month",
            "day",
            "epw_hour",
            "epw_minute",
            "wea_decimal_standard_hour",
            "wea_source_clock_label",
            "normalized_real_timestamp",
            "epw_dry_bulb_C",
            "clm_dry_bulb_tenths_C",
            "epw_wind_m_s",
            "clm_wind_tenths_m_s",
            "epw_direction_deg",
            "clm_direction_deg",
            "epw_relative_humidity_percent",
            "clm_relative_humidity_percent",
            "epw_direct_Wh_m2",
            "wea_direct_irradiance_W_m2",
            "clm_direct_intensity_W_m2",
            "epw_diffuse_Wh_m2",
            "wea_diffuse_irradiance_W_m2",
            "clm_diffuse_W_m2",
            "epw_liquid_depth_mm",
            "epw_accumulation_duration_hr",
            "producer_rain_rate_m_hr",
            "rain_rate_minus_depth_div_1000_numeric",
            "project_admission",
            "temporal_semantic_status",
            "rainfall_semantic_status"
          ],
          "column_count": 35,
          "primary_key_columns": [
            "weather_scenario_id",
            "epw_record_1based"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/微观试验准备/天气跨格式试核_20261006/README.md",
          "bytes": 5041,
          "sha256": "42134d453f8abf69614de87c38711857d0dd28662c355b0aaa97980c7fc0e7f5",
          "role": "source_preparation_read_only",
          "file_kind": "md"
        },
        {
          "path": "共享接口/微观试验准备/天气跨格式试核_20261006/核对跨格式天气.py",
          "bytes": 13203,
          "sha256": "4a4b7b70c6c0ce638046463fd19e045640aaeb3dc5d488df04ba85abb0ebc80b",
          "role": "source_preparation_read_only",
          "file_kind": "py"
        },
        {
          "path": "共享接口/微观试验准备/天气跨格式试核_20261006/独立天气跨格式核查.json",
          "bytes": 10610,
          "sha256": "f6e1027c26e35c85d2968085405045820836fae2d1423fcb76259281dd3b5aaf",
          "role": "source_preparation_read_only",
          "file_kind": "json"
        },
        {
          "path": "共享接口/微观试验准备/天气跨格式试核_20261006/独立核查天气跨格式.py",
          "bytes": 18920,
          "sha256": "3a74b837c2fbb09160407d1cc1425048e8d439c886c28f6c1d2bd0ef69185052",
          "role": "source_preparation_read_only",
          "file_kind": "py"
        },
        {
          "path": "共享接口/微观试验准备/天气跨格式试核_20261006/跨格式来源与实际核查.json",
          "bytes": 11253,
          "sha256": "881a766158b67fe45a110d9653b76543b4c6142e930d0e603cace3acddcb5493",
          "role": "source_preparation_read_only",
          "file_kind": "json"
        }
      ],
      "scientific_adoption": "not_adopted",
      "software_intake": "not_yet_executed",
      "area_D_physical_access_fairness_ranking_outputs_available": false
    },
    "manifest_source": {
      "path": "平台产品设计/来源准备三组接入清单_20261006.json",
      "bytes": 35509,
      "sha256": "4fbe5e23e47436869fbd78fc74741e5bbeb60a4017c73001b1b7583d7a1c8860"
    },
    "archive": {
      "bytes": 33242,
      "sha256": "918fed29298ce1f9759ec6daa1d219c6be6337db8b431d59d700c24ae430b40d"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-05T22:11:05.777Z",
      "file_acceptance": "verified_31_source_bytes_and_original_manifest",
      "science_validation": "source_preparation_not_adopted",
      "integration": "read_only_source_review",
      "execution": "source_metadata_verified_no_producer_or_research_run",
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
    "schema_version": "0.1.source-preparation-registration",
    "group_id": "road-source-connectivity",
    "registration_id": "source-preparation:road-source-connectivity:f17fae93c427ff5798f75cb7359d022267a8fe40ffea4c729c3c6f1ba294f9f5",
    "source_group": {
      "group_id": "road-source-connectivity",
      "title": "源节点连通与受体衔接缺口",
      "source_folder": "共享接口/服务链准备/源线连通诊断_20261006",
      "schema_version": "0.1.read-only-source-preparation",
      "source_set_sha256": "f17fae93c427ff5798f75cb7359d022267a8fe40ffea4c729c3c6f1ba294f9f5",
      "registration_id": "source-preparation:road-source-connectivity:f17fae93c427ff5798f75cb7359d022267a8fe40ffea4c729c3c6f1ba294f9f5",
      "file_count": 9,
      "files": [
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/README.md",
          "bytes": 6217,
          "sha256": "cc0a573f8cd9098aa753826c1ce7ff8c85465f2cf9be6dfb75491cb0079d5cb9",
          "role": "source_preparation_read_only",
          "file_kind": "md"
        },
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/原相邻段.csv",
          "bytes": 64637,
          "sha256": "5c9316d83182e385ff8fe5306b1fb0717cacd6f87daf998ec03207e914f85cf9",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 87,
          "columns": [
            "segment_key",
            "source_way_key",
            "source_feature_id",
            "source_segment_index_0based",
            "from_node_key",
            "to_node_key",
            "from_osm_node_id",
            "to_osm_node_id",
            "from_vertex_index_0based",
            "to_vertex_index_0based",
            "geometry_crs",
            "geometry_wkt",
            "source_segment_length_m",
            "context_positive_intersection_length_m",
            "geometry_scope",
            "highway_raw",
            "foot_raw",
            "access_raw",
            "bridge_raw",
            "tunnel_raw",
            "layer_raw",
            "source_ref_adjacency",
            "legal_walk_connection",
            "legal_walk_connection_state",
            "travel_time_min",
            "route_cost",
            "source_component_id"
          ],
          "column_count": 27,
          "primary_key_columns": [
            "segment_key"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/原节点.csv",
          "bytes": 46209,
          "sha256": "9175755c72fb21432c974c747c19ef7814778fc012adb5b8e2bb29dd7558d17b",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 81,
          "columns": [
            "node_key",
            "source_osm_node_id",
            "source_pbf_path",
            "source_pbf_sha256",
            "pbf_node_version",
            "node_last_edit_time_utc",
            "source_lon",
            "source_lat",
            "source_crs",
            "x_m",
            "y_m",
            "measurement_crs",
            "inside_or_on_context",
            "source_ways_json",
            "way_endpoint_of_json",
            "source_way_incidence_count",
            "source_segment_incidence_count",
            "distinct_source_node_neighbor_count",
            "source_component_id",
            "coordinate_consistency",
            "public_walk_node_verified",
            "grade_or_junction_verified",
            "service_node_state"
          ],
          "column_count": 23,
          "primary_key_columns": [
            "node_key"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/受体与道路线平面关系.csv",
          "bytes": 87491,
          "sha256": "acea430e5dae9d35cd053753abf29c00da1c0d8adff6c2f2be2668a62dca517b",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 102,
          "columns": [
            "relation_key",
            "receptor_key",
            "receptor_id",
            "receptor_asset_path",
            "receptor_asset_sha256",
            "receptor_layer",
            "source_way_key",
            "source_feature_id",
            "receptor_x_m",
            "receptor_y_m",
            "measurement_crs",
            "point_intersects_full_source_line_exact",
            "source_planar_point_line_distance_m",
            "distance_semantics",
            "role_public_destination",
            "role_resident_origin",
            "point_position_confirmed",
            "graph_attachment_node_key",
            "graph_attachment_accepted",
            "entrance_id",
            "legal_access",
            "stay_permission",
            "opening_time",
            "route_distance_m",
            "travel_time_min",
            "service_value"
          ],
          "column_count": 26,
          "primary_key_columns": [
            "relation_key"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        },
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/源几何连通核查.json",
          "bytes": 9568,
          "sha256": "3981d5962470dd2c6339fea9586b351bacf5278c5fd4921aa9a5857f93581da5",
          "role": "source_preparation_read_only",
          "file_kind": "json"
        },
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/独立回读核查.json",
          "bytes": 1409,
          "sha256": "cadc3fc54ef5ccb14786a82275bc968df26843ec01183b44a632551d14c63778",
          "role": "source_preparation_read_only",
          "file_kind": "json"
        },
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/独立回读核查.py",
          "bytes": 9286,
          "sha256": "443f7f40417942fa1783004af440605732fc5cb232ca9496158b1ce9d5a96fed",
          "role": "source_preparation_read_only",
          "file_kind": "py"
        },
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/生成源几何诊断.py",
          "bytes": 21556,
          "sha256": "072f48459de5c3d53dd0fee0a74030dc0b0eb5c7a8a9b1c2b5f3ef09154df067",
          "role": "source_preparation_read_only",
          "file_kind": "py"
        },
        {
          "path": "共享接口/服务链准备/源线连通诊断_20261006/道路线关系.csv",
          "bytes": 86382,
          "sha256": "75325abb729a1914442029e4cd384f5e51d267c9d1417e5dcec2d2cc506e4866",
          "role": "source_preparation_read_only",
          "file_kind": "csv",
          "row_count": 136,
          "columns": [
            "relation_key",
            "left_way_key",
            "right_way_key",
            "left_source_feature_id",
            "right_source_feature_id",
            "relation_kind",
            "shared_osm_node_ids_json",
            "shared_source_node_count",
            "endpoint_endpoint_shared_ids_json",
            "shared_nodes_inside_context_json",
            "geometry_intersects",
            "intersection_geometry_type",
            "intersection_wkt",
            "intersection_crs",
            "intersection_length_m",
            "intersection_hits_context",
            "source_reference_graph_adjacency",
            "planar_intersection_auto_connected",
            "left_bridge_raw",
            "right_bridge_raw",
            "left_tunnel_raw",
            "right_tunnel_raw",
            "left_layer_raw",
            "right_layer_raw",
            "same_grade_or_legal_crossing_verified",
            "verified_public_connection",
            "grade_state"
          ],
          "column_count": 27,
          "primary_key_columns": [
            "relation_key"
          ],
          "primary_keys_unique": true,
          "raw_empty_cell_policy": "preserve_raw_empty_string; typed_unknown_if_used_null; never_zero_or_adopted"
        }
      ],
      "scientific_adoption": "not_adopted",
      "software_intake": "not_yet_executed",
      "area_D_physical_access_fairness_ranking_outputs_available": false
    },
    "manifest_source": {
      "path": "平台产品设计/来源准备三组接入清单_20261006.json",
      "bytes": 35509,
      "sha256": "4fbe5e23e47436869fbd78fc74741e5bbeb60a4017c73001b1b7583d7a1c8860"
    },
    "archive": {
      "bytes": 45756,
      "sha256": "ec29afc4102fb4801fd849b38c014485f2763855d8782450d7da862e23985277"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-05T22:11:05.777Z",
      "file_acceptance": "verified_31_source_bytes_and_original_manifest",
      "science_validation": "source_preparation_not_adopted",
      "integration": "read_only_source_review",
      "execution": "source_metadata_verified_no_producer_or_research_run",
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
