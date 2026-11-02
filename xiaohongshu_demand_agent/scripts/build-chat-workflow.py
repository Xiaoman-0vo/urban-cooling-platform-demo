#!/usr/bin/env python3
# 生成 04-demand-chat 工作流（n8n Chat 内置聊天窗）
# 为什么用脚本生成：JS 源码有 300 多行，手写进 JSON 容易被转义搞坏；改源码后重跑即重建工作流。
#
# 用法：python scripts/build-chat-workflow.py
# 产物：workflows/04-demand-chat.json
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "workflows" / "src"
OUT = ROOT / "workflows" / "04-demand-chat.json"
LEXICON = ROOT / "config" / "place-lexicon.v2.json"
TAXONOMY = ROOT / "config" / "taxonomy.v1.json"

CHAT_HOOK = "wc9d1f2a34b7e48c0"      # 聊天窗地址里的那一段，固定住方便记
WEBHOOK_URL = "http://127.0.0.1:5678/webhook/weibo-demand/v1"

# 大模型：汇总环节用（Header Auth 凭据，跟 03/04 里判定用的是同一个）
CRED_ID = "2ozwVH9LQlzzNSfF"
CRED_NAME = "DeepSeek API"
MODEL_URL = "https://api.deepseek.com/chat/completions"


# 中文标签直接取自词表，不手抄，避免改词表后界面还说旧词
def taxonomy_zh():
    tax = json.loads(TAXONOMY.read_text(encoding="utf-8"))
    out = {}
    for dim in ("heat_relevance", "evaluation_direction", "activity_scene",
                "demand_topic", "content_types", "experience_tags", "spatial_demands"):
        node = tax.get(dim) or {}
        if isinstance(node, dict) and node.get("label_zh"):
            out[dim] = node["label_zh"]
    return out


def js(name):
    """读 JS 源码并注入词表/标签（标记不存在就原样返回）"""
    code = (SRC / name).read_text(encoding="utf-8")
    if "/*__PLACE_LEXICON__*/null" in code:
        lex = json.loads(LEXICON.read_text(encoding="utf-8"))
        code = code.replace("/*__PLACE_LEXICON__*/null", json.dumps(lex, ensure_ascii=False))
    if "/*__TAXONOMY_ZH__*/null" in code:
        code = code.replace("/*__TAXONOMY_ZH__*/null", json.dumps(taxonomy_zh(), ensure_ascii=False))
    if "/*__ANSWER_CAPS__*/null" in code:
        caps = json.loads((ROOT / "config" / "answer-caps.json").read_text(encoding="utf-8"))
        code = code.replace("/*__ANSWER_CAPS__*/null", json.dumps(caps, ensure_ascii=False))
    return code


def code_node(name, jsfile, x, y):
    return {
        "parameters": {"jsCode": js(jsfile)},
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x, y],
    }


def if_node(name, conds, x, y):
    return {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                "conditions": conds,
                "combinator": "and",
            },
            "options": {},
        },
        "name": name,
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [x, y],
    }


def equals(id_, left, right):
    return {
        "id": id_,
        "leftValue": left,
        "rightValue": right,
        "operator": {"type": "string", "operation": "equals"},
    }


def is_true(id_, left):
    return {
        "id": id_,
        "leftValue": left,
        "rightValue": True,
        "operator": {"type": "boolean", "operation": "equals"},
    }


nodes = []

# 0) 聊天窗触发器
nodes.append({
    "parameters": {
        "public": True,              # 本机演示：打开链接就能聊，不需要登录 n8n
        "mode": "hostedChat",
        "initialMessages": "我是微博热感知助手，只能做两件事：\n1) 问某地现状（读已有快照，秒回）\n2) 贴一条微博正文（调模型判定，约 3-8 秒）\n\n试试：查成都 遮阴",
        "options": {"responseMode": "lastNode"},
    },
    "name": "聊天窗",
    "type": "@n8n/n8n-nodes-langchain.chatTrigger",
    "typeVersion": 1.5,
    "position": [0, 0],
    "webhookId": CHAT_HOOK,
})

# 1) 意图识别
nodes.append(code_node("1-意图", "chat-1-intent.js", 240, 0))

# 2) 分叉判断：先问现状 → 再开采集 → 再查进度 → 最后判文本
nodes.append(if_node("If-问现状?", [equals("c-query", "={{ $json.intent }}", "query")], 480, -60))
nodes.append(if_node("If-判文本?", [equals("c-classify", "={{ $json.intent }}", "classify")], 480, 300))
nodes.append(if_node("If-开采集?", [equals("c-collect", "={{ $json.intent }}", "collect")], 480, 120))
nodes.append(if_node("If-查进度?", [equals("c-status", "={{ $json.intent }}", "status")], 480, 200))

# 2d) 下单：任务单 → 文本 → 文件（写进 /data/jobs，宿主机工人读得到）
nodes.append(code_node("2d-生成任务JSON", "chat-4-job.js", 720, 120))
nodes.append({
    "parameters": {
        "operation": "toText",
        "sourceProperty": "job_text",
        "binaryPropertyName": "data",
        "options": {"fileName": "job.json", "encoding": "utf8"},
    },
    "name": "2d2-转成文件",
    "type": "n8n-nodes-base.convertToFile",
    "typeVersion": 1.2,
    "position": [880, 120],
})
nodes.append({
    "parameters": {
        "operation": "write",
        "fileName": "={{ '/data/jobs/' + $('2d-生成任务JSON').first().json.job_id + '.json' }}",
        "dataPropertyName": "data",
        "options": {"append": False},
    },
    "name": "2d3-写任务文件",
    "type": "n8n-nodes-base.readWriteFile",
    "typeVersion": 1.1,
    "position": [1040, 120],
})
# 2d4) 同时把任务单指针写到 latest.json：
# 进度条读的就是这一份。没这一步，陌生人下单后直到工人接单前，前端什么都看不到。
nodes.append({
    "parameters": {
        "operation": "write",
        "fileName": "/data/jobs/latest.json",
        "dataPropertyName": "data",
        "options": {"append": False},
    },
    "name": "2d4-写进度指针",
    "type": "n8n-nodes-base.readWriteFile",
    "typeVersion": 1.1,
    "position": [1120, 120],
})
nodes.append(code_node("3d-回执", "chat-3d-receipt.js", 1200, 120))

# 3c) 查进度：读 latest.json（工人每次更新任务都会同步这一份）
nodes.append({
    "parameters": {
        "operation": "read",
        "fileSelector": "/data/jobs/latest.json",
        "options": {},
    },
    "name": "2e-读进度",
    "type": "n8n-nodes-base.readWriteFile",
    "typeVersion": 1.1,
    "position": [720, 200],
    "onError": "continueRegularOutput",
})
nodes.append({
    "parameters": {
        "operation": "text",
        "binaryPropertyName": "data",
        "options": {"destinationKey": "data"},
    },
    "name": "2f-进度文本",
    "type": "n8n-nodes-base.extractFromFile",
    "typeVersion": 1.2,
    "position": [880, 200],
    "onError": "continueRegularOutput",
})
nodes.append(code_node("3e-进度", "chat-5-progress.js", 1040, 200))

# 3a) 读快照 → 解成文本
# onError=continueRegularOutput：城市没有快照时读文件会 ENOENT，不能让整条流程炸，
# 让它带着"没读到"往下走，由后面的 If-缺快照? 决定是否自动下单采集。
nodes.append({
    "parameters": {
        "operation": "read",
        "fileSelector": "={{ '/data/' + $('1-意图').first().json.city_file }}",
        "options": {},
    },
    "name": "2a-读快照",
    "type": "n8n-nodes-base.readWriteFile",
    "typeVersion": 1.1,
    "position": [740, -160],
    "onError": "continueRegularOutput",
})
# 读文件出来的是二进制，必须显式转成文本，否则 Code 里拿到的不是 UTF-8 原文
nodes.append({
    "parameters": {
        "operation": "text",
        "binaryPropertyName": "data",
        "options": {"destinationKey": "data"},
    },
    "name": "2c-取文本",
    "type": "n8n-nodes-base.extractFromFile",
    "typeVersion": 1.2,
    "position": [880, -160],
    "onError": "continueRegularOutput",
})

# 2g) 问现状：先把快照整理成事实 + 模型请求体
nodes.append(code_node("2g-构造摘要", "chat-6-facts.js", 1020, -160))
# 2h) 问现状：让模型把这些事实讲成人话（超时/失败不炸流程，渲染层有规则兜底）
nodes.append({
    "parameters": {
        "method": "POST",
        "url": MODEL_URL,
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.model_body) }}",
        "options": {"timeout": 30000, "response": {"response": {"neverError": True}}},
    },
    "name": "2h-调摘要模型",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [1180, -160],
    "credentials": {"httpHeaderAuth": {"id": CRED_ID, "name": CRED_NAME}},
    "onError": "continueRegularOutput",
    "alwaysOutputData": True,
})

# 3b) 调契约服务
body = (
    "={{ JSON.stringify({"
    " contract_version: '1.0.0',"
    " request_id: $('1-意图').first().json.request_id,"
    " action: 'classify',"
    " payload: {"
    "   text: $('1-意图').first().json.text,"
    "   scope: $('1-意图').first().json.scope"
    " }"
    " }) }}"
)
nodes.append({
    "parameters": {
        "method": "POST",
        "url": WEBHOOK_URL,
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": body,
        "options": {
            "timeout": 120000,
            "response": {"response": {"neverError": True}},
        },
    },
    "name": "2b-调契约",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [740, 120],
})

# 4) 两个格式化器 + 兜底帮助
nodes.append(code_node("3a-汇总", "chat-3a-summary.js", 1360, -160))
# 快照读不到时：有城市名 → 走自动下单（复用 2d 那几个节点）；没城市名 → 提示
nodes.append(if_node("If-缺快照?", [is_true("c-missing", "={{ $json.snapshot_missing }}")], 1520, -160))
# If 节点的输出没有 output 字段，聊天窗会显示空消息；这个节点把 3a 的排版结果原样传下去
nodes.append(code_node("3a2-透传", "chat-3a-pass.js", 1680, -80))
nodes.append(code_node("3b-格式化", "chat-3b-format.js", 1000, 120))
nodes.append(code_node("9-帮助", "chat-9-help.js", 740, 360))

# 说明便签
nodes.append({
    "parameters": {
        "content": "## 微博热感知聊天窗\n"
                   "两个入口，共用一套判定：\n"
                   "- **问现状** → 读 `/data/heat_perception*.json`（不花钱、秒回）\n"
                   "- **贴正文** → 调 `03-demand-agent-api`（模型，3-8 秒）\n\n"
                   "边界：不是温度观测，不代表人数；无线索≠没有热问题。\n\n"
                   "改动后重跑 `python scripts/build-chat-workflow.py` 再部署。",
        "height": 260,
        "width": 420,
    },
    "name": "说明",
    "type": "n8n-nodes-base.stickyNote",
    "typeVersion": 1,
    "position": [-460, -60],
})

connections = {
    "聊天窗": {"main": [[{"node": "1-意图", "type": "main", "index": 0}]]},
    "1-意图": {"main": [[{"node": "If-问现状?", "type": "main", "index": 0}]]},
    "If-问现状?": {"main": [
        [{"node": "2a-读快照", "type": "main", "index": 0}],
        [{"node": "If-开采集?", "type": "main", "index": 0}],
    ]},
    "If-开采集?": {"main": [
        [{"node": "2d-生成任务JSON", "type": "main", "index": 0}],
        [{"node": "If-查进度?", "type": "main", "index": 0}],
    ]},
    "If-查进度?": {"main": [
        [{"node": "2e-读进度", "type": "main", "index": 0}],
        [{"node": "If-判文本?", "type": "main", "index": 0}],
    ]},
    "If-判文本?": {"main": [
        [{"node": "2b-调契约", "type": "main", "index": 0}],
        [{"node": "9-帮助", "type": "main", "index": 0}],
    ]},
    "2a-读快照": {"main": [[{"node": "2c-取文本", "type": "main", "index": 0}]]},
    "2c-取文本": {"main": [[{"node": "2g-构造摘要", "type": "main", "index": 0}]]},
    "2g-构造摘要": {"main": [[{"node": "2h-调摘要模型", "type": "main", "index": 0}]]},
    "2h-调摘要模型": {"main": [[{"node": "3a-汇总", "type": "main", "index": 0}]]},
    "3a-汇总": {"main": [[{"node": "If-缺快照?", "type": "main", "index": 0}]]},
    "If-缺快照?": {"main": [
        [{"node": "2d-生成任务JSON", "type": "main", "index": 0}],   # 缺快照 → 自动下单采集
        [{"node": "3a2-透传", "type": "main", "index": 0}],          # 有快照 → 原样输出
    ]},
    "2b-调契约": {"main": [[{"node": "3b-格式化", "type": "main", "index": 0}]]},
    "2d-生成任务JSON": {"main": [[{"node": "2d2-转成文件", "type": "main", "index": 0}]]},
    "2d2-转成文件": {"main": [[{"node": "2d3-写任务文件", "type": "main", "index": 0}]]},
    "2d3-写任务文件": {"main": [[{"node": "2d4-写进度指针", "type": "main", "index": 0}]]},
    "2d4-写进度指针": {"main": [[{"node": "3d-回执", "type": "main", "index": 0}]]},
    "2e-读进度": {"main": [[{"node": "2f-进度文本", "type": "main", "index": 0}]]},
    "2f-进度文本": {"main": [[{"node": "3e-进度", "type": "main", "index": 0}]]},
}

workflow = {
    "name": "04-demand-chat",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "active": False,
}

OUT.write_text(json.dumps([workflow], ensure_ascii=False, indent=1), encoding="utf-8")
print(f"OK 写入 {OUT.relative_to(ROOT)}：{len(nodes)} 个节点")
print(f"聊天地址：http://127.0.0.1:5678/webhook/{CHAT_HOOK}/chat")
