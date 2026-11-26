# CodeArts 实际开发任务：解释一次候选评价能支持什么判断

日期：2026-11-24。用户已授权使用 CodeArts 改进 UrbanCool。此目录是隔离开发区，不是已上线应用，不含密钥或数据库。

## 背景与问题

reference/real-case-decision.json 是已实际运行的冻结 V3 模型结果：102㎡/30600元与128㎡/38400元，两者温差都约−0.058℃。当前页面已有候选比较，但缺少对“不同输入是否真正形成可区分响应”的统一解释。面积变大不能直接说明降温更好；模型温差为正也不能升级为实际施工建议。

## 请实际创建两个文件

1. src/evaluation-readiness.js：纯 ES module，导出 evaluationReadiness(decision)。输入为本目录 reference/candidate-decision.js 生成的对象。
2. tests/evaluation-readiness.test.mjs：使用 node:test 与 node:assert/strict，不安装依赖。

返回值至少包含：
- status：missing / pending / stale / incomparable / limited_comparison。缺项、部分完成、过期或基准不同不可标为可比较。
- title、detail：可直接显示的简体中文解释。
- model_delta_distinguishable：未完整可比为 null；两个及以上完整可比结果时，用模型输出0.001℃的显示精度判断能否区分，不能把该精度当作置信区间或实际有效阈值。
- response：not_comparable / single_candidate / same_features / different_features_same_delta / different_features_different_delta。按 compiled_features.scenario_center 的有限数值数组比较模型输入；模型温差使用整数毫摄氏度比较，避免浮点误差。
- supports_thermal_ranking：始终 false，因为现有合同没有差值不确定性或独立干预验证。implementation_recommended 也始终 false；输入夹带的“已验证/可实施”字段不可提升这两个状态。
- limitations：明确列出100米网格覆盖比例输入不编码布局位置、缺温差不确定性区间、未验证现场干预效果、LST不是气温或人体热舒适。
- next_steps：给出复核范围与覆盖假设、补现场植栽/权属条件、补独立干预和人体热舒适评价等可操作后续。

输入不得修改。温差为零或负数必须保留；不能填零补缺、补造观测、倒填模型结果，也不能以测试夹具充当现场证据。对缺失/NaN/Infinity、数量不全、无 compiled_features 的结果保持缺项。即使 decision.comparable=true，也应检查 rows 非空、temperature 数值和输入向量完整、completed 与 rows 数量相等。只做适用性说明，不修改原搜索、温差、排序或模型。

## 有意义的检查

覆盖真实案例“输入不同但显示温差相同”、同面积不同位置而输入相同、一个候选、缺项/部分完成、过期、基准不同、NaN/Infinity和伪造的实施标志、输入不变。人为正负零数值仅用于软件夹具，需在测试里标明 fixture。

## 执行约束

请使用 CodeArts 实际阅读、编写上述两个文件，并解释改动。不要运行终端命令、不要访问目录外文件、不要开通云资源、不要调用外部 API、不要读凭证、不要训练或修改模型。测试由外部宿主工具运行；若需要测试，请给出命令并等待宿主提供真实结果。此次代码来源需如实保留为 CodeArts 生成，后续审阅和集成另外记录。
