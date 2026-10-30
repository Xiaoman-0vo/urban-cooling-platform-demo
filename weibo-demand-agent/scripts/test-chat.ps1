# 测聊天窗：直接给聊天接口发一句话，看它回什么
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-chat.ps1
param(
    [string]$Hook = 'wc9d1f2a34b7e48c0',
    [string]$Base = 'http://127.0.0.1:5678'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$url = "$Base/webhook/$Hook/chat"

# 每个用例都带 expect：只"有回复"不算通过，回复里得有关键词。
# 注意：不要用"没有快照但词表里有"的城市做用例——那会真的派出采集任务（见 docs/06 §3.5.1）。
$cases = @(
    @{ name = '问现状·成都遮阴'; text = '查成都 遮阴';   expect = '微博热感知' },
    @{ name = '问现状·重庆候车'; text = '重庆 候车 现状'; expect = '重庆' },
    @{ name = '贴一条微博';      text = '太阳晒得人眼睛都睁不开，这段路树荫一点都没有，等公交晒到冒烟'; expect = '这句话说了什么' },
    @{ name = '没说清';          text = '你好';           expect = '两种用法' },
    @{ name = '词表外地名';      text = '定西现在有多少线索'; expect = '下单' }
)

# n8n 重启后聊天路由要过几秒才注册好，先探一下，别把 404 当成功能坏了
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    try {
        $probe = @{ action = 'sendMessage'; chatInput = 'hi'; sessionId = 'warmup' } | ConvertTo-Json -Compress
        $pb = [System.Text.Encoding]::UTF8.GetBytes($probe)
        $null = Invoke-WebRequest -Uri $url -Method Post -Body $pb -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 30
        $ready = $true; break
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 404) { Start-Sleep -Seconds 2; continue }
        $ready = $true; break
    }
}
if (-not $ready) { Write-Host '聊天路由 80 秒内没注册好' -ForegroundColor Red; exit 1 }

$pass = 0
foreach ($c in $cases) {
    $payload = @{ action = 'sendMessage'; chatInput = $c.text; sessionId = 'smoke-' + [guid]::NewGuid().ToString('N').Substring(0, 8) } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $t0 = Get-Date
    try {
        $r = Invoke-WebRequest -Uri $url -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 180
        $ms = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
        $raw = [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
        $out = ''
        try {
            $j = $raw | ConvertFrom-Json
            foreach ($k in @('output', 'text', 'message')) { if ($j.$k) { $out = $j.$k; break } }
            if (-not $out) { $out = $raw }
        } catch { $out = $raw }
        Write-Host ("`n=== {0}  [{1}s, HTTP {2}] ===" -f $c.name, $ms, $r.StatusCode) -ForegroundColor Cyan
        Write-Host $out
        if ($out -and ($out -notmatch [regex]::Escape($c.expect))) {
            Write-Host ("  ^ 缺关键词「{0}」" -f $c.expect) -ForegroundColor Yellow
        } elseif ($out) { $pass++ }
    } catch {
        $msg = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg = $_.ErrorDetails.Message }
        Write-Host ("`n=== {0}  [失败] ===" -f $c.name) -ForegroundColor Red
        Write-Host $msg
    }
}
Write-Host ("`n通过用例：{0}/{1}" -f $pass, $cases.Count) -ForegroundColor Yellow
if ($pass -lt $cases.Count) { exit 1 }
