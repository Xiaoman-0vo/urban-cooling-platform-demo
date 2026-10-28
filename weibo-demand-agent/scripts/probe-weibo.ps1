# 微博接口连通性探针 —— 先搞清楚「哪一层能用」，再谈写采集器
# 用法（直接跑，不用管参数）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\probe-weibo.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\probe-weibo.ps1 -Keyword "人民公园 热" -Comments 2
#
# 两点实测结论（本脚本已固化）：
#   1) 用 curl.exe 而不是 Invoke-WebRequest：PowerShell 5.1 经系统代理会做证书吊销检查，
#      必报 "CRYPT_E_REVOCATION_OFFLINE"；curl 加 --ssl-no-revoke 可绕过。
#   2) weibo.com 的 PC 接口只认桌面 UA，m.weibo.cn 的移动端接口只认移动 UA，混用会 403。
# Cookie 从哪来：见 docs\04-采集适配器说明.md 第 2 节，存到项目根目录 .weibo-cookie（已 gitignore）
param(
    [string]$Keyword = '成都 高温',
    [int]$Comments = 2
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$cookieFile = Join-Path $root '.weibo-cookie'
$cookie = ''
if (Test-Path $cookieFile) {
    $cookie = (Get-Content $cookieFile -Raw -Encoding UTF8).Trim()
    if ($cookie) {
        Write-Host ("Cookie: 已读取 {0} 字符（末 6 位 …{1}）" -f $cookie.Length, $cookie.Substring([Math]::Max(0, $cookie.Length - 6))) -ForegroundColor DarkGray
    }
} else {
    Write-Host 'Cookie: 未提供（.weibo-cookie 不存在）→ 下面会看到哪些层被拦住' -ForegroundColor Yellow
}

$UA_DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
$UA_MOB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function New-Headers {
    param([string]$Kind = 'mob')
    if ($Kind -eq 'desk') {
        $h = @('-H', "User-Agent: $UA_DESK", '-H', 'Referer: https://weibo.com/',
            '-H', 'Accept: application/json, text/plain, */*', '-H', 'Accept-Language: zh-CN,zh;q=0.9')
    } else {
        $h = @('-H', "User-Agent: $UA_MOB", '-H', 'Referer: https://m.weibo.cn/',
            '-H', 'Accept: application/json, text/plain, */*', '-H', 'Accept-Language: zh-CN,zh;q=0.9',
            '-H', 'X-Requested-With: XMLHttpRequest', '-H', 'MWeibo-Pwa: 1')
    }
    if ($cookie) { $h += @('-H', "Cookie: $cookie") }
    return $h
}

function Invoke-CurlJson {
    param([string]$Url, [string]$Kind = 'mob')
    $tmp = [IO.Path]::GetTempFileName()
    $out = [ordered]@{ label = ''; url = $Url; http = 0; ok = $false; msg = ''; len = 0; json = $null }
    $h = New-Headers $Kind
    try {
        $code = (& curl.exe -sS --ssl-no-revoke --noproxy '*' -m 25 -o $tmp -w '%{http_code}' --url $Url @h 2>&1) -join ''
        if ($code -match '^\d{3}$') { $out.http = [int]$code } else { $out.msg = (($code -replace "`r?`n", ' ').Trim()) }

        if ($out.http -eq 432) { $out.msg = '微博风控拦截（432）：Cookie 无效/过期，或请求太频繁' }
        elseif ($out.http -eq 403) { $out.msg = '被拒绝（403）：缺 Cookie，或 UA/Referer 与端点不匹配' }

        if (Test-Path $tmp) {
            $body = Get-Content $tmp -Raw -Encoding UTF8
            $out.len = if ($body) { $body.Length } else { 0 }
            if ($body -and $body.TrimStart().StartsWith('{')) {
                try {
                    $out.json = $body | ConvertFrom-Json
                    if ($out.json.ok -eq 1) { $out.ok = $true }
                    elseif ($out.json.ok -eq -100) { $out.msg = '需要登录态（ok:-100 → 跳转 passport 登录）' }
                    elseif ($out.json.msg) { $out.msg = $out.json.msg }
                } catch { $out.msg = 'JSON 解析失败' }
            } elseif ($body -and $body -match 'Sina Visitor System') {
                $out.msg = '被重定向到访客登录页（Sina Visitor System）→ 需要 Cookie'
            } elseif ($body -and $body.Length -gt 0) {
                $out.msg = "返回 HTML（$($body.Length) 字符），不是接口数据"
            } elseif (-not $out.msg) {
                $out.msg = '空响应'
            }
        }
    } catch {
        $out.msg = $_.Exception.Message
    } finally {
        if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    }
    return $out
}

$report = @()

# ---- 1. PC 端热搜榜：匿名一般可读，用来区分「网络不通」和「权限不够」----
$r1 = Invoke-CurlJson 'https://weibo.com/ajax/side/hotSearch' 'desk'
$r1['label'] = '1-连通性(热搜榜)'
if ($r1.ok -and $r1.json.data.realtime) {
    $r1['msg'] = "热榜 $($r1.json.data.realtime.Count) 条，第 1 条：「$($r1.json.data.realtime[0].word)」"
}
$report += $r1

# ---- 2. 关键词搜索：民意按话题召回的核心 ----
$q = [uri]::EscapeDataString($Keyword)
$r2 = Invoke-CurlJson "https://m.weibo.cn/api/container/getIndex?containerid=100103type%3D1%26q%3D$q&page_type=searchall"
$r2['label'] = "2-搜索(关键词=$Keyword)"
$mids = @()
if ($r2.ok -and $r2.json.data.cards) {
    $cards = @($r2.json.data.cards)
    $mids = @($cards | ForEach-Object { $_.mblog.id } | Where-Object { $_ })
    $r2['msg'] = "卡片 $($cards.Count) 个，其中微博 $($mids.Count) 条"
}
$report += $r2

# ---- 3. 一级评论：前 N 页 ----
if ($mids.Count -gt 0) {
    $mid = $mids[0]
    $total = 0
    for ($p = 1; $p -le $Comments; $p++) {
        $r3 = Invoke-CurlJson "https://m.weibo.cn/api/comments/show?id=$mid&page=$p"
        $r3['label'] = "3-评论(第${p}页, mid=$mid)"
        if ($r3.ok -and $r3.json.data) {
            $n = @($r3.json.data).Count
            $total += $n
            $r3['msg'] = "评论 $n 条，该微博评论总数 $($r3.json.total_number)"
        }
        $report += $r3
    }
    Write-Host ("   一级评论合计可读：{0} 条（前 {1} 页）" -f $total, $Comments) -ForegroundColor DarkGray
} else {
    $report += [ordered]@{ label = '3-评论(跳过)'; url = ''; http = 0; ok = $false; msg = '没拿到微博 id（第 2 项失败），无法测评论接口'; len = 0; json = $null }
}

# ---- 汇总 ----
Write-Host ''
Write-Host ('{0,-30} {1,-6} {2,-6} {3}' -f '检查项', 'HTTP', '结果', '说明') -ForegroundColor Cyan
Write-Host ('-' * 100)
foreach ($x in $report) {
    $color = if ($x.ok) { 'Green' } else { 'Red' }
    Write-Host ('{0,-30} {1,-6} {2,-6} {3}' -f $x.label, $x.http, $(if ($x.ok) { 'OK' } else { 'FAIL' }), $x.msg) -ForegroundColor $color
}
Write-Host ('-' * 100)

$okCount = @($report | Where-Object { $_.ok }).Count
if ($okCount -eq $report.Count) {
    Write-Host ("结论：{0}/{1} 项可用 → 可以开始写实时采集器。" -f $okCount, $report.Count) -ForegroundColor Green
    exit 0
} else {
    Write-Host ("结论：{0}/{1} 项可用。" -f $okCount, $report.Count) -ForegroundColor Yellow
    Write-Host '下一步：按 docs\04-采集适配器说明.md 第 2 节拿到 Cookie，存成 .weibo-cookie 后重跑本脚本。' -ForegroundColor Yellow
    exit 1
}
