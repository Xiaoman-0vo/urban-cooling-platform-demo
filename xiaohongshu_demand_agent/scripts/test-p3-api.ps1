# P3 规则层 —— 走真实 HTTP 的验收测试（不是本地模拟，是真的打到 n8n）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-p3-api.ps1
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:5678/webhook/weibo-demand/v1'

function Post-Item($obj) {
    $json = $obj | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    try {
        $r = Invoke-WebRequest -Uri $base -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing
        return @{ code = [int]$r.StatusCode; body = ($r.Content | ConvertFrom-Json) }
    } catch {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { throw }
        # PowerShell 5.1 的坑：错误响应的正文在 ErrorDetails.Message 里，GetResponseStream() 读出来是空的
        $text = $_.ErrorDetails.Message
        if (-not $text) {
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $text = $sr.ReadToEnd()
        }
        return @{ code = [int]$resp.StatusCode; body = ($text | ConvertFrom-Json) }
    }
}

function New-Req($text, $action = 'classify') {
    return [ordered]@{
        contract_version = '1.0.0'
        request_id       = 'req-http-' + ([guid]::NewGuid().ToString('N').Substring(0, 12))
        action           = $action
        payload          = [ordered]@{ text = $text }
    }
}

$cases = @(
    @{ name = '歧义-热搜：应短路为不相关'; text = '热搜第一又是明星八卦，这个话题的热度真高。';
       check = { param($b) $b.result.route -eq 'rule_short_circuit' -and $b.result.item.heat_relevance -eq 'irrelevant' } },
    @{ name = '歧义-手机发热：应短路'; text = '手机发热太严重了，刚买就烫手，客服还说是正常的。';
       check = { param($b) $b.result.route -eq 'rule_short_circuit' } },
    @{ name = '纯广告-热卖：应短路'; text = '夏日热卖！全场五折，加微信领取优惠券，买一送一。';
       check = { param($b) $b.result.route -eq 'rule_short_circuit' } },
    @{ name = '亲历-树荫改善：应进模型且时间=当前'; text = '今天在人民公园东门，树下凉快多了，就是没地方坐。';
       check = { param($b) $b.result.route -in @('needs_model','model','model_failed') -and $b.result.rules.time_status_hint -eq 'current' -and $b.result.rules.pre_labels.evaluation_direction -eq 'improvement' } },
    @{ name = '预报-未来：应进模型且时间=未来'; text = '天气预报说下周会很热，最高温要到 38 度。';
       check = { param($b) $b.result.route -in @('needs_model','model','model_failed') -and $b.result.rules.time_status_hint -eq 'future' } },
    @{ name = '历史：应进模型且时间=历史'; text = '去年夏天在春熙路晒得受不了，走两步就想躲进商场。';
       check = { param($b) $b.result.route -in @('needs_model','model','model_failed') -and $b.result.rules.time_status_hint -eq 'historical' } },
    @{ name = '否定结构：应打 negated 旗标'; text = '不是我说，天府广场那边真的没树荫，等车的时候暴晒。';
       check = { param($b) $b.result.rules.flags.negated -eq $true -and ($b.result.rules.pre_labels.spatial_demands -contains 'shade_deficit') } },
    @{ name = '空文本：门口就拦（400）'; text = ''; code = 400;
       check = { param($b) $b.status -eq 'error' -and ($b.errors | Where-Object { $_.path -eq '$.payload.text' }) } }
)

$fail = 0
$i = 0
Write-Host ''
Write-Host ('{0,-42} {1,-6} {2}' -f '用例', '结果', 'HTTP/route') -ForegroundColor Cyan
Write-Host ('-' * 78)
foreach ($c in $cases) {
    $i++
    $resp = Post-Item (New-Req $c.text)
    $route = if ($resp.body.result) { $resp.body.result.route } else { ($resp.body.errors | ForEach-Object { $_.code }) -join ',' }
    $expectCode = if ($c.ContainsKey('code')) { $c.code } else { 200 }
    $ok = ($resp.code -eq $expectCode) -and (& $c.check $resp.body)
    if (-not $ok) { $fail++ }
    $color = if ($ok) { 'Green' } else { 'Red' }
    Write-Host ('{0,-42} {1,-6} {2}/{3}' -f $c.name, $(if ($ok) { 'PASS' } else { 'FAIL' }), $resp.code, $route) -ForegroundColor $color
}

# health
$h = Post-Item ([ordered]@{ contract_version = '1.0.0'; request_id = 'req-health-http'; action = 'health'; payload = @{} })
$okH = ($h.code -eq 200) -and ($h.body.result.alive -eq $true) -and ($h.body.result.route -eq 'health')
if (-not $okH) { $fail++ }
Write-Host ('{0,-42} {1,-6} {2}/{3}' -f 'health：应短路且 alive=true', $(if ($okH) { 'PASS' } else { 'FAIL' }), $h.code, $h.body.result.route) -ForegroundColor $(if ($okH) { 'Green' } else { 'Red' })

# 契约非法
$bad = Post-Item ([ordered]@{ contract_version = '0.9'; request_id = 'sh'; action = 'nope' })
$okB = ($bad.code -eq 400) -and ($bad.body.status -eq 'error') -and ($bad.body.errors.Count -ge 3)
if (-not $okB) { $fail++ }
Write-Host ('{0,-42} {1,-6} {2}/errors={3}' -f '契约非法：应 400 且多条字段错误', $(if ($okB) { 'PASS' } else { 'FAIL' }), $bad.code, $bad.body.errors.Count) -ForegroundColor $(if ($okB) { 'Green' } else { 'Red' })

Write-Host ('-' * 78)
$total = $cases.Count + 2
if ($fail -eq 0) {
    Write-Host ("P3 验收通过：{0} 项全部符合预期。" -f $total) -ForegroundColor Green
    exit 0
} else {
    Write-Host ("P3 验收失败：{0}/{1} 项不符合预期。" -f $fail, $total) -ForegroundColor Red
    exit 1
}
