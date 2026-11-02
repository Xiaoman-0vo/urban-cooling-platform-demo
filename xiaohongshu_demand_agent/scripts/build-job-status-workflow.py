# 构建 05-job-status：给聊天页的进度条提供 JSON
# 为什么单独一个工作流：聊天窗用的是 chat trigger（只能收消息），
# 进度条需要"随时能 GET 一次"，所以另开一个普通 webhook，只读文件、不调模型。
import json
import io
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "workflows" / "05-job-status.json"
SRC = ROOT / "workflows" / "src"

WEBHOOK_PATH = "weibo-job-status"
HOOK_ID = "ws7b3c1e90d5a24f18"


def js(name):
    return (SRC / name).read_text(encoding="utf-8")


nodes = []

nodes.append({
    "parameters": {"httpMethod": "GET", "path": WEBHOOK_PATH, "responseMode": "responseNode", "options": {}},
    "name": "进度查询",
    "type": "n8n-nodes-base.webhook",
    "typeVersion": 2,
    "position": [0, 0],
    "webhookId": HOOK_ID,
})

nodes.append({
    "parameters": {"operation": "read", "fileSelector": "/data/jobs/latest.json", "options": {}},
    "name": "1-读任务",
    "type": "n8n-nodes-base.readWriteFile",
    "typeVersion": 1.1,
    "position": [240, 0],
    "onError": "continueRegularOutput",
})

nodes.append({
    "parameters": {"operation": "text", "binaryPropertyName": "data", "options": {"destinationKey": "data"}},
    "name": "2-转文本",
    "type": "n8n-nodes-base.extractFromFile",
    "typeVersion": 1.2,
    "position": [440, 0],
    "onError": "continueRegularOutput",
})

nodes.append({
    "parameters": {"jsCode": js("status-1-shape.js"), "options": {}},
    "name": "3-整理",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [640, 0],
})

nodes.append({
    "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}",
        "options": {"responseCode": "={{ $json.http_status }}", "responseHeaders": {"entries": [
            {"name": "Access-Control-Allow-Origin", "value": "*"},
            {"name": "Cache-Control", "value": "no-store"},
        ]}},
    },
    "name": "4-回包",
    "type": "n8n-nodes-base.respondToWebhook",
    "typeVersion": 1.1,
    "position": [860, 0],
})

connections = {
    "进度查询": {"main": [[{"node": "1-读任务", "type": "main", "index": 0}]]},
    "1-读任务": {"main": [[{"node": "2-转文本", "type": "main", "index": 0}]]},
    "2-转文本": {"main": [[{"node": "3-整理", "type": "main", "index": 0}]]},
    "3-整理": {"main": [[{"node": "4-回包", "type": "main", "index": 0}]]},
}

workflow = {
    "name": "05-job-status",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "active": False,
}

OUT.write_text(json.dumps([workflow], ensure_ascii=False, indent=1), encoding="utf-8")
print(f"OK 写入 {OUT.relative_to(ROOT)}：{len(nodes)} 个节点")
print(f"地址：http://127.0.0.1:5678/webhook/{WEBHOOK_PATH}")
