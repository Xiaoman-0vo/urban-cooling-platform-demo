# 部署一个工作流到本机 n8n（原地更新，保持 workflow id 不变）
# 为什么不用界面导入：界面导入每次都新建一个同名工作流，几次之后就分不清哪个在跑。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-workflow.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-workflow.ps1 -WorkflowFile workflows\03-demand-agent-api.json
param(
    [string]$WorkflowFile = 'workflows\03-demand-agent-api.json',
    [string]$BaseName = '03-demand-agent-api',
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$file = Join-Path $root $WorkflowFile
if (-not (Test-Path $file)) { throw "找不到工作流文件：$file" }

# 0) 工作流名以文件里的 name 为准（手滑漏传 -BaseName 时，旧默认值会把另一个工作流的 id 注进来，
#    结果"部署成功"但改的是别人——这个坑踩过，所以这里强制覆盖）。
$wfName = ((Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json)[0]).name
if ($wfName) { $BaseName = $wfName }

# 1) 找出 n8n 里同名工作流的 id（取最近更新的那个）
docker exec n8n n8n export:workflow --all --output=/data/_deploy_all.json 2>&1 | Out-Null
$tmp = Join-Path $root 'data\_deploy_all.json'
Copy-Item 'data\_deploy_all.json' $tmp -ErrorAction SilentlyContinue
$existing = (Get-Content $tmp -Raw -Encoding UTF8 | ConvertFrom-Json) | Where-Object { $_.name -eq $BaseName }
$targetId = $null
if ($existing) {
    $targetId = ($existing | Sort-Object updatedAt -Descending | Select-Object -First 1).id
    if (@($existing).Count -gt 1) {
        Write-Host ("注意：有 {0} 个同名工作流，更新最近的 id={1}" -f @($existing).Count, $targetId) -ForegroundColor Yellow
    }
}

# 2) 注入 id 后写一个临时文件（UTF-8 无 BOM，n8n 的 JSON 解析器不接受 BOM）
$obj = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json
$w = $obj[0]
if ($targetId) { $w | Add-Member -NotePropertyName id -NotePropertyValue $targetId -Force }
$text = '[' + ($w | ConvertTo-Json -Depth 40) + ']'
$staging = Join-Path $root 'data\_deploy_workflow.json'
[System.IO.File]::WriteAllText($staging, $text, (New-Object System.Text.UTF8Encoding($false)))

# 3) 拷进容器并导入
docker cp $staging n8n:/data/_deploy_workflow.json | Out-Null
docker exec n8n n8n import:workflow --input=/data/_deploy_workflow.json 2>&1 | Select-Object -Last 1

# 4) 发布（导入会把工作流置为未激活，必须 publish 才接 webhook）
# 导入后一律按名字重新取一次 id：旧逻辑只在"没找到"时才查，一旦默认值写错就会发布错的工作流
# （表现为"部署成功"但线上还是旧代码）。
$targetId = $null
if (-not $targetId) {
    docker exec n8n n8n export:workflow --all --output=/data/_deploy_all2.json 2>&1 | Out-Null
    $tmp2 = Join-Path $root 'data\_deploy_all2.json'
    $targetId = ((Get-Content $tmp2 -Raw -Encoding UTF8 | ConvertFrom-Json) | Where-Object { $_.name -eq $BaseName } | Sort-Object updatedAt -Descending | Select-Object -First 1).id
}
$pub = docker exec n8n n8n publish:workflow --id=$targetId 2>&1
Write-Host ("已导入并发布：id={0}" -f $targetId)

# 5) 重启容器（CLI 的 publish 不会让运行中的进程加载新版本）
if (-not $NoRestart) {
    docker restart n8n | Out-Null
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        try {
            $h = Invoke-WebRequest -Uri 'http://127.0.0.1:5678/healthz' -UseBasicParsing -TimeoutSec 3
            if ($h.StatusCode -eq 200) { $ok = $true; break }
        } catch { }
    }
    if ($ok) { Write-Host 'n8n 已重启并健康 (healthz=200)' -ForegroundColor Green }
    else { throw 'n8n 重启后 60 秒内未就绪，请 docker logs n8n 查看' }

    # healthz 通过 ≠ webhook 已注册（实测重启后有几秒窗口期，网关会返回非 JSON 的错误页）。
    # 因此再等「真的能打通」为止：用 health action 打一次，拿到 200 与合法 JSON 才继续。
    $ready = $false
    $body = [System.Text.Encoding]::UTF8.GetBytes('{"contract_version":"1.0.0","request_id":"req-deploy-wait","action":"health","payload":{}}')
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5678/webhook/weibo-demand/v1' -Method Post -Body $body -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200 -and $r.Content -like '*"alive":true*') { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if ($ready) { Write-Host 'webhook 已注册并可返回合法 JSON' -ForegroundColor Green }
    else { throw 'webhook 在 60 秒内没有就绪（healthz 通过了，但 /webhook/weibo-demand/v1 打不通）' }
}

Remove-Item $staging -ErrorAction SilentlyContinue
Remove-Item $tmp -ErrorAction SilentlyContinue
$tmp2 = Join-Path $root 'data\_deploy_all2.json'
Remove-Item $tmp2 -ErrorAction SilentlyContinue
