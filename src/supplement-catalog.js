// Frozen explicit byte identities. New sources require a separate registered snapshot.
export const SUPPLEMENT_CATALOG = Object.freeze([
  {
    "group_id": "planning-description",
    "title": "规划来源描述",
    "schema_version": "0.1.read-only-planning-description",
    "registration_id": "supplement:planning-description:468c71f9882389df5f1f517f9f28beb528e2711b8cf77a29461497461802e100",
    "sources": [
      {
        "path": "共享接口/规划描述底稿/README.md",
        "bytes": 9045,
        "sha256": "f5085593feb2263776d905d5d50274c123e1f367fddbe9a6d9a4e2917caa0f44",
        "mime_type": "text/markdown"
      },
      {
        "path": "共享接口/规划描述底稿/现状指标描述统计.csv",
        "bytes": 15662,
        "sha256": "6bfcf42babc60f5ca7956d0b1a81bee285c7fde07ef02c315589e55db2bde538",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/规划描述底稿/描述范围与适用状态核查.json",
        "bytes": 23972,
        "sha256": "17a687b8d8e2e0b65675a8837077d8c272c65514db73852994fb6a7d2d92b803",
        "mime_type": "application/json"
      },
      {
        "path": "共享接口/规划描述底稿/现状绿色组织与建成背景.png",
        "bytes": 1257373,
        "sha256": "87961ab48423a9f521cb3301d92e2e52a7a5ed289a154daf6bdde7ee06b629f0",
        "mime_type": "image/png"
      }
    ],
    "archive": {
      "bytes": 1159754,
      "sha256": "ff99d4abe7f3c625a84cc7abd8260c7a2106399cd19257d99ba5f794dd3ea7ab"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-05T21:35:51.817Z",
      "file_acceptance": "verified_explicit_original_bytes",
      "science_validation": "source_states_preserved_no_upgrade",
      "integration": "read_only_review",
      "execution": "metadata_checked_no_research_execution",
      "operation_gates": {
        "prediction": false,
        "physical_simulation": false,
        "service_evaluation": false,
        "fairness_evaluation": false,
        "candidate_generation": false,
        "ranking": false
      },
      "application_gates": {
        "new_site_prediction": false,
        "physical_simulation": false,
        "pedestrian_thermal_comfort": false,
        "actual_access_or_use_service": false,
        "fairness_evaluation": false,
        "minimum_new_green_area_search": false,
        "candidate_generation": false,
        "ranking": false,
        "planning_response_or_cooling_effect": false
      }
    }
  },
  {
    "group_id": "planning-development",
    "title": "配置开发信息",
    "schema_version": "0.1.read-only-planning-development",
    "registration_id": "supplement:planning-development:aa6b6e5bb29b9d9fad46cc248502abaaa78bb2f445aa2be94c9ccbcde9530f44",
    "sources": [
      {
        "path": "共享接口/规划开发增补/说明与边界.md",
        "bytes": 4241,
        "sha256": "00809352247e8a29dc69d831d6f770a8ec6675b421544ca7a8654c8566c82bb8",
        "mime_type": "text/markdown"
      },
      {
        "path": "共享接口/规划开发增补/开发增补来源绑定.json",
        "bytes": 13971,
        "sha256": "f8d5d24b64bdf21d0dbceff7b5116f0236514a243e11013bca3d2f5221d04801",
        "mime_type": "application/json"
      },
      {
        "path": "共享接口/规划开发增补/配置开发误差_紧凑.csv",
        "bytes": 21490,
        "sha256": "9ef34a6a180e677acd14baf76d2f5ec2eef913a14392983e86556c3db387941c",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/规划开发增补/配对增量_紧凑.csv",
        "bytes": 27684,
        "sha256": "a1b1d61fdc0a6a14c9ce4a1aaec96ef701759870e72714b9655eecd46aee08a7",
        "mime_type": "text/csv"
      }
    ],
    "archive": {
      "bytes": 21803,
      "sha256": "5d60d8854e2a7020e172bd885ebd5266e00329d60f202b6de5613db963bbb9c8"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-05T21:35:51.817Z",
      "file_acceptance": "verified_explicit_original_bytes",
      "science_validation": "source_states_preserved_no_upgrade",
      "integration": "read_only_review",
      "execution": "metadata_checked_no_research_execution",
      "operation_gates": {
        "prediction": false,
        "physical_simulation": false,
        "service_evaluation": false,
        "fairness_evaluation": false,
        "candidate_generation": false,
        "ranking": false
      },
      "application_gates": {
        "new_site_prediction": false,
        "physical_simulation": false,
        "pedestrian_thermal_comfort": false,
        "actual_access_or_use_service": false,
        "fairness_evaluation": false,
        "minimum_new_green_area_search": false,
        "candidate_generation": false,
        "ranking": false,
        "planning_response_or_cooling_effect": false
      }
    }
  },
  {
    "group_id": "candidate-resource",
    "title": "候选资源与窗口",
    "schema_version": "0.1.read-only-candidate-resource",
    "registration_id": "supplement:candidate-resource:cd5cb7d6b47c1fbabeeb123c483bb8cafe8baa1073b0c62fbda8b89ec3287abf",
    "sources": [
      {
        "path": "共享接口/公平性输入准备/资源支持试核/六住宅植被资源支持候选.csv",
        "bytes": 16717,
        "sha256": "0d93ad325814bdabd077375cdd1795cc8576c3f5ee1efa415a17dfcadced085e",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/公平性输入准备/资源支持试核/候选窗口重叠.csv",
        "bytes": 6805,
        "sha256": "1aef8e7ef3e76e5f992392bc82e091ef9f63027fe6598b33fbddf2cf172e86f6",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/公平性输入准备/资源支持试核/资源支持说明.md",
        "bytes": 9159,
        "sha256": "e999fdfe16f9917282fdf7847fe5f5e6d3aa0715e96cbc583397195101444664",
        "mime_type": "text/markdown"
      },
      {
        "path": "共享接口/公平性输入准备/资源支持试核/资源支持核查.json",
        "bytes": 20040,
        "sha256": "b8e4ac75a5dc3ec980a9bfdee21566eadc04fdce967fd358082ec3d54f76b128",
        "mime_type": "application/json"
      },
      {
        "path": "共享接口/公平性输入准备/资源支持试核/保存回读核查.json",
        "bytes": 1153,
        "sha256": "a831aafb20d8c3c7bf93fa45141ecae5c3d70fdbf67623d16c8a20cc3ef0c4df",
        "mime_type": "application/json"
      },
      {
        "path": "共享接口/公平性输入准备/窗口敏感性试核/六对象窗口变化.csv",
        "bytes": 1548,
        "sha256": "f84b1181cec565cfaa95f8d390ca0d3338cb869933391ce787ef0fbde51a7dbb",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/公平性输入准备/窗口敏感性试核/候选份额顺序变化.csv",
        "bytes": 9590,
        "sha256": "3cb5cbfa8300d6a84fb7d73c346721a3e01d990088de9118a8090b9e8e43aa17",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/公平性输入准备/窗口敏感性试核/窗口敏感性说明.md",
        "bytes": 5459,
        "sha256": "146610c2a4929a2c582561c5a3305017aa334e54f352a205ae9f607a6eb52a5a",
        "mime_type": "text/markdown"
      },
      {
        "path": "共享接口/公平性输入准备/窗口敏感性试核/窗口敏感性核查.json",
        "bytes": 2072,
        "sha256": "c1a33466c4e75c1ca9b95e8740a040d6675abd3bba80c5e1fb27f6dae3d4111c",
        "mime_type": "application/json"
      }
    ],
    "archive": {
      "bytes": 23609,
      "sha256": "c63701ebde36cfceb1dbdba1d1cd24a8f32e4492ecebe3efbdb9c0ca3145872b"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-05T21:35:51.817Z",
      "file_acceptance": "verified_explicit_original_bytes",
      "science_validation": "source_states_preserved_no_upgrade",
      "integration": "read_only_review",
      "execution": "metadata_checked_no_research_execution",
      "operation_gates": {
        "prediction": false,
        "physical_simulation": false,
        "service_evaluation": false,
        "fairness_evaluation": false,
        "candidate_generation": false,
        "ranking": false
      },
      "application_gates": {
        "new_site_prediction": false,
        "physical_simulation": false,
        "pedestrian_thermal_comfort": false,
        "actual_access_or_use_service": false,
        "fairness_evaluation": false,
        "minimum_new_green_area_search": false,
        "candidate_generation": false,
        "ranking": false,
        "planning_response_or_cooling_effect": false
      }
    }
  },
  {
    "group_id": "modifiable-evidence",
    "title": "可改空间证据",
    "schema_version": "0.1.read-only-modifiable-evidence",
    "registration_id": "supplement:modifiable-evidence:4d103b7f02b7e3f960b78e388d77c6aad523dc8cddfd1f602cb3b0daf4b9aaf7",
    "sources": [
      {
        "path": "共享接口/微观试验准备/可改空间接纳证据表_20261006.csv",
        "bytes": 13250,
        "sha256": "e7053b11a3f8ae21fda6158587f168d71625f34ca88bb9779947a1d4cd5fcc33",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/微观试验准备/可改空间接纳证据表_20261006.md",
        "bytes": 5317,
        "sha256": "4d5bf99c37061035ca85c362cc7d228aa174daaa54402237a99ba4f8405a35d4",
        "mime_type": "text/markdown"
      },
      {
        "path": "共享接口/微观试验准备/可改空间来源存在与版本_20261006.csv",
        "bytes": 18987,
        "sha256": "82f583e828ba3ba34704970678e9b6dcf28e7fa3c749a0c84e47f954ea0dbe37",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/微观试验准备/可改空间来源与对象证据_20261006.json",
        "bytes": 187416,
        "sha256": "8cb0d39292c08de20553141daa27d4698288e664bdded4c76a349aaf538a4680",
        "mime_type": "application/json"
      }
    ],
    "archive": {
      "bytes": 36238,
      "sha256": "8c4e61fc8e95ccbb0a8c3cbc0019f831c50a21bb67dbf3db9692a603ac6e8188"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-05T21:35:51.817Z",
      "file_acceptance": "verified_explicit_original_bytes",
      "science_validation": "source_states_preserved_no_upgrade",
      "integration": "read_only_review",
      "execution": "metadata_checked_no_research_execution",
      "operation_gates": {
        "prediction": false,
        "physical_simulation": false,
        "service_evaluation": false,
        "fairness_evaluation": false,
        "candidate_generation": false,
        "ranking": false
      },
      "application_gates": {
        "new_site_prediction": false,
        "physical_simulation": false,
        "pedestrian_thermal_comfort": false,
        "actual_access_or_use_service": false,
        "fairness_evaluation": false,
        "minimum_new_green_area_search": false,
        "candidate_generation": false,
        "ranking": false,
        "planning_response_or_cooling_effect": false
      }
    }
  },
  {
    "group_id": "focal-neighbor",
    "title": "本格与周边描述",
    "schema_version": "0.1.read-only-focal-neighbor",
    "registration_id": "supplement:focal-neighbor:fe7435085bff0dcd4353c812a1e355550615573b2d606bada220eaa56a43f00f",
    "sources": [
      {
        "path": "共享接口/本格与周边描述/README.md",
        "bytes": 7998,
        "sha256": "0df7b9a59d25d6bf7a82e801804e247fdb8ef7b74b6201d76b6a49a988a1b1c7",
        "mime_type": "text/markdown"
      },
      {
        "path": "共享接口/本格与周边描述/本格与八邻格逐格对照.csv",
        "bytes": 3609210,
        "sha256": "bb31204d3fe05841ed110eeeab144039107607d2deb6f2986b47eacc86acc43e",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/本格与周边描述/六指标对照支持与差异.csv",
        "bytes": 812,
        "sha256": "34d1f0892aea873367b07e4a86a9aa13ae58db9d7e983929dd6a04eb4bb270a9",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/本格与周边描述/共同案例与极值示例.csv",
        "bytes": 3060,
        "sha256": "e33f6ddd4e88f4086876141f085d3707a7c0b67662dc151b360c5ca9a0258ecc",
        "mime_type": "text/csv"
      },
      {
        "path": "共享接口/本格与周边描述/本格周边描述核查.json",
        "bytes": 6965,
        "sha256": "afe23bf89f9bc9cf0157b9883ffa9b938b4f73cb9c4add9447b2497cea9a3a27",
        "mime_type": "application/json"
      },
      {
        "path": "共享接口/本格与周边描述/制图来源与样式核查.json",
        "bytes": 4118,
        "sha256": "1c601c0fddbaea6a02b3442fd8269199aafb8dfa4f5501f9293512727488d378",
        "mime_type": "application/json"
      },
      {
        "path": "共享接口/本格与周边描述/本格与周边比例差异.png",
        "bytes": 606354,
        "sha256": "179bb2dfac2c17baa43c0bc9c66bf8e243b2f4a02e6cb4b5b5e0a711d3eb44cc",
        "mime_type": "image/png"
      },
      {
        "path": "共享接口/本格与周边描述/本格与周边比例差异.svg",
        "bytes": 2670986,
        "sha256": "2e5ba6c3d4bb413a1798469cd63454d2460f18154f69d944ab5c8c9046592a6f",
        "mime_type": "image/svg+xml"
      },
      {
        "path": "共享接口/本格与周边描述/差值色阶近似色觉检查.png",
        "bytes": 36499,
        "sha256": "30204df08a44567ea6ae7a40564361ee26cd02e9653961c10957ac0c8942a15a",
        "mime_type": "image/png"
      },
      {
        "path": "共享接口/本格与周边描述/独立核查.json",
        "bytes": 19174,
        "sha256": "e9b49ec0469e5aeaa2e291133c8fbd3759c18e3f90780adb908692909023b1ef",
        "mime_type": "application/json"
      },
      {
        "path": "共享接口/本格与周边描述/复现与接纳检查.json",
        "bytes": 1269,
        "sha256": "26bd53a1c200025f9d670f5f033c687cdfdda4ed34bf9ebe1ef81cc1805d71f0",
        "mime_type": "application/json"
      }
    ],
    "archive": {
      "bytes": 1519195,
      "sha256": "36ce0d2095fb9ab33a5001e21c882b98306d4f0406829a722da95b9b0ee6cef4"
    },
    "adapter_receipt": {
      "version": "0.1",
      "registered_at": "2026-10-05T21:35:51.817Z",
      "file_acceptance": "verified_explicit_original_bytes",
      "science_validation": "source_states_preserved_no_upgrade",
      "integration": "read_only_review",
      "execution": "metadata_checked_no_research_execution",
      "operation_gates": {
        "prediction": false,
        "physical_simulation": false,
        "service_evaluation": false,
        "fairness_evaluation": false,
        "candidate_generation": false,
        "ranking": false
      },
      "application_gates": {
        "new_site_prediction": false,
        "physical_simulation": false,
        "pedestrian_thermal_comfort": false,
        "actual_access_or_use_service": false,
        "fairness_evaluation": false,
        "minimum_new_green_area_search": false,
        "candidate_generation": false,
        "ranking": false,
        "planning_response_or_cooling_effect": false
      }
    }
  }
]);
