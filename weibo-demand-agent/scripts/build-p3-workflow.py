"""构建 P3 工作流 JSON（规则层版本）。

为什么用脚本生成而不是手写 JSON：
  jsCode 里全是中文和引号，手写极易转义出错；脚本读 .js 文件再序列化，保证与源码逐字一致。
用法：python scripts/build-p3-workflow.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "workflows" / "src"
OUT = ROOT / "workflows" / "03-demand-agent-api.json"

# 地名词表在构建时注入 Code 节点：n8n 的 Code 节点读不到工作区文件，
# 又不想把词表在 .js 里复制一份（两份必然漂移），所以只保留一个源文件。
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
        "name": "Respond to Webhook",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.1,
        "position": [980, 0],
        "parameters": {
            "respondWith": "json",
            "responseBody": "={{ $json.body }}",
            "options": {"responseCode": "={{ $json.code }}"},
        },
    },
    {
        "name": "说明",
        "type": "n8n-nodes-base.stickyNote",
        "typeVersion": 1,
        "position": [-40, -380],
        "parameters": {
            "content": (
                "## P3 规则层（rules_version = r1）\n\n"
                "**POST** `/webhook/weibo-demand/v1`\n\n"
                "三个节点，三种出口（看返回体 `result.route`）：\n"
                "1. `error` —— 契约不合法，400，不进规则层\n"
                "2. `health` —— 健康检查，直接 200\n"
                "3. `rule_short_circuit` —— 歧义词命中（热搜/热度/热卖/手机发热…）"
                "且无任何热环境证据 → 判 **irrelevant**，**不调用模型**\n"
                "4. `needs_model` —— 其余全部交给 P4 的模型链\n\n"
                "规则只提高候选优先级，不单独定最终标签。\n"
                "`result.rules.rule_notes` 是给答辩念的人话解释。"
            ),
            "height": 360,
            "width": 460,
        },
    },
    {
        "name": "短路说明",
        "type": "n8n-nodes-base.stickyNote",
        "typeVersion": 1,
        "position": [470, 220],
        "parameters": {
            "content": (
                "### 为什么短路逻辑放在 Code 里，不画成 If 分支？\n\n"
                "P4 接模型后，真正的分支点是「要不要花模型的钱」：\n"
                "`route === 'needs_model'` → 进模型链，其余直接返回。\n"
                "那时才需要 If 节点；现在拆成两个 Code 只会增加出错面。"
            ),
            "height": 220,
            "width": 420,
        },
    },
]

workflow = [
    {
        "name": "03-demand-agent-api",
        "nodes": nodes,
        "connections": {
            "Webhook": {"main": [[{"node": "1-契约校验", "type": "main", "index": 0}]]},
            "1-契约校验": {"main": [[{"node": "2-规则层", "type": "main", "index": 0}]]},
            "2-规则层": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
        },
        "settings": {"executionOrder": "v1"},
    }
]

OUT.write_text(
    json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(nodes)} nodes)")

# 自检：JSON 能读回、jsCode 与源文件一致
back = json.loads(OUT.read_text(encoding="utf-8"))
codes = {n["name"]: n["parameters"]["jsCode"] for n in back[0]["nodes"] if n["type"].endswith("code")}
assert codes["1-契约校验"] == js("p3-1-contract-check.js")
assert codes["2-规则层"] == js("p3-2-rule-layer.js")
print("self-check ok: jsCode 与 workflows/src/*.js 逐字一致")
