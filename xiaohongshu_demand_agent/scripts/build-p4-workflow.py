"""构建 P4 工作流 JSON（规则层 + 模型层）。

与 build-p3-workflow.py 的区别：
  多了 If 分支 —— 只有 route=needs_model 且 action=classify 才花钱调模型；
  其余出口（health / rule_only / 契约错误）直接回 Respond，一分钱不花。

用法：python scripts/build-p4-workflow.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "workflows" / "src"
OUT = ROOT / "workflows" / "03-demand-agent-api.json"

CRED_ID = "2ozwVH9LQlzzNSfF"
CRED_NAME = "DeepSeek API"

# 地名词表在构建时注入 Code 节点：n8n 的 Code 节点读不到工作区文件，
# 又不想把词表在 .js 里复制一份（两份必然漂移），所以只保留 config/place-lexicon.v2.json 一个源。
LEXICON = json.loads((ROOT / "config" / "place-lexicon.v2.json").read_text(encoding="utf-8"))
LEX_MARK = "/*__PLACE_LEXICON__*/null"


def js(name: str) -> str:
    src = (SRC / name).read_text(encoding="utf-8")
    if LEX_MARK in src:
        src = src.replace(LEX_MARK, json.dumps(LEXICON, ensure_ascii=False))
        assert LEX_MARK not in src
    return src


def code_node(name, position, filename):
    return {
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": position,
        "parameters": {"mode": "runOnceForAllItems", "jsCode": js(filename)},
        "onError": "stopWorkflow",
    }


def sticky(name, position, content, width, height):
    return {
        "name": name,
        "type": "n8n-nodes-base.stickyNote",
        "typeVersion": 1,
        "position": position,
        "parameters": {"content": content, "height": height, "width": width},
    }


nodes = [
    {
        "name": "Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [0, 0],
        "webhookId": "weibo-demand-v1",
        "parameters": {
            "httpMethod": "POST",
            "path": "weibo-demand/v1",
            "responseMode": "responseNode",
            "options": {},
        },
    },
    code_node("1-契约校验", [260, 0], "p3-1-contract-check.js"),
    code_node("2-规则层", [620, 0], "p3-2-rule-layer.js"),
    {
        "name": "If-需要模型?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [900, 0],
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                "conditions": [
                    {
                        "id": "c-decision",
                        "leftValue": "={{ $json.decision }}",
                        "rightValue": "needs_model",
                        "operator": {"type": "string", "operation": "equals"},
                    },
                    {
                        "id": "c-action",
                        "leftValue": "={{ $('1-契约校验').first().json.req.action }}",
                        "rightValue": "classify",
                        "operator": {"type": "string", "operation": "equals"},
                    },
                ],
                "combinator": "and",
            },
            "options": {},
        },
    },
    code_node("3-构造模型请求", [1180, -160], "p4-3-build-model-request.js"),
    {
        "name": "4-调用模型",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1460, -160],
        "parameters": {
            "method": "POST",
            "url": "https://api.deepseek.com/chat/completions",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.model_body) }}",
            "options": {
                "timeout": 60000,
                "response": {"response": {"neverError": True}},
            },
        },
        "credentials": {"httpHeaderAuth": {"id": CRED_ID, "name": CRED_NAME}},
        # 模型超时/5xx 不炸整个工作流，交给 5-校验与合并 出结构化错误（E_MODEL_CALL_FAILED）
        "onError": "continueRegularOutput",
    },
    code_node("5-校验与合并", [1740, -160], "p4-5-validate-merge.js"),
    {
        "name": "Respond to Webhook",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.1,
        "position": [2020, 40],
        "parameters": {
            "respondWith": "json",
            "responseBody": "={{ $json.body }}",
            "options": {"responseCode": "={{ $json.code }}"},
        },
    },
    sticky(
        "说明",
        [-40, -380],
        "## P4 规则层 + 模型层（r1 / t1 / c1）\n\n"
        "**POST** `/webhook/weibo-demand/v1`\n\n"
        "分支只看一件事：**这一条值不值得花模型的钱**。\n\n"
        "| route | 含义 | 去向 |\n|---|---|---|\n"
        "| `error` | 契约不合法 | 400，最左短路 |\n"
        "| `health` | 健康检查 | 直接 200 |\n"
        "| `rule_only` | 歧义词（热搜/热度/热卖）命中且无热证据 | 判 irrelevant，200 |\n"
        "| `needs_model` | 其余 | → 模型链 → 确定性校验 |\n\n"
        "模型只负责“读出线索”，`5-校验与合并` 才说了算：\n"
        "枚举越界就丢、证据回查不到就降级、置信度由确定性依据合成。",
        460,
        420,
    ),
    sticky(
        "模型链说明",
        [1180, -480],
        "### 为什么证据回查放在最后一环\n\n"
        "模型会编 quote。这里拿 quote 去原文 `indexOf`，找不到就作废——"
        "这是整条链唯一不依赖模型自觉的地方。\n\n"
        "**没有可回查证据的 relevant，一律降级 needs_review 并进人工队列。**",
        420,
        260,
    ),
]

workflow = [
    {
        "name": "03-demand-agent-api",
        "nodes": nodes,
        "connections": {
            "Webhook": {"main": [[{"node": "1-契约校验", "type": "main", "index": 0}]]},
            "1-契约校验": {"main": [[{"node": "2-规则层", "type": "main", "index": 0}]]},
            "2-规则层": {"main": [[{"node": "If-需要模型?", "type": "main", "index": 0}]]},
            "If-需要模型?": {
                "main": [
                    [{"node": "3-构造模型请求", "type": "main", "index": 0}],
                    [{"node": "Respond to Webhook", "type": "main", "index": 0}],
                ]
            },
            "3-构造模型请求": {"main": [[{"node": "4-调用模型", "type": "main", "index": 0}]]},
            "4-调用模型": {"main": [[{"node": "5-校验与合并", "type": "main", "index": 0}]]},
            "5-校验与合并": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
        },
        "settings": {"executionOrder": "v1"},
    }
]

OUT.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(nodes)} nodes)")

back = json.loads(OUT.read_text(encoding="utf-8"))
codes = {n["name"]: n["parameters"]["jsCode"] for n in back[0]["nodes"] if n["type"].endswith("code")}
for name, fname in [
    ("1-契约校验", "p3-1-contract-check.js"),
    ("2-规则层", "p3-2-rule-layer.js"),
    ("3-构造模型请求", "p4-3-build-model-request.js"),
    ("5-校验与合并", "p4-5-validate-merge.js"),
]:
    assert codes[name] == js(fname), f"{name} 的 jsCode 与 {fname} 不一致"
print("self-check ok: 4 个 Code 节点的 jsCode 与 workflows/src/*.js 逐字一致")
