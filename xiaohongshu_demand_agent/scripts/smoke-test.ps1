# Safe HTTP smoke checks: health, deterministic rule route, invalid contracts.
# No collection jobs or model inference requests are generated.
param([string]$BaseUrl = '')
$ErrorActionPreference = 'Stop'
if (-not $BaseUrl) {
    $config = (& node (Join-Path $PSScriptRoot 'runtime-config.mjs')) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot load classifier configuration.' }
    $BaseUrl = $config.classifierOrigin + '/webhook/weibo-demand/v1'
}
$cases = @(
    @{ name='health'; code=200; body='{"contract_version":"1.0.0","request_id":"req-smoke-health","action":"health","payload":{}}'; check={ param($b) $b.status -eq 'ok' -and $b.result.alive -eq $true -and $b.result.route -eq 'health' } },
    @{ name='rule-only classify'; code=200; body='{"contract_version":"1.0.0","request_id":"req-smoke-rules","action":"classify","payload":{"text":"\u70ed\u641c\u7b2c\u4e00\u53c8\u662f\u660e\u661f\u516b\u5366"}}'; check={ param($b) $b.status -eq 'ok' -and $b.result.route -eq 'rule_short_circuit' -and $b.result.item.heat_relevance -eq 'irrelevant' } },
    @{ name='invalid action'; code=400; body='{"contract_version":"1.0.0","request_id":"req-smoke-action","action":"nonsense","payload":{}}'; check={ param($b) $b.status -eq 'error' -and @($b.errors | Where-Object { $_.code -eq 'E_CONTRACT_INVALID' -and $_.path -eq '$.action' }).Count -gt 0 } },
    @{ name='multiple invalid fields'; code=400; body='{"contract_version":"2.0.0","request_id":"short","action":"health"}'; check={ param($b) $b.status -eq 'error' -and @($b.errors).Count -ge 3 } }
)
$failed = 0
foreach ($case in $cases) {
    $code = -1; $body = $null
    try {
        $r = Invoke-WebRequest -Uri $BaseUrl -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($case.body)) -TimeoutSec 15 -UseBasicParsing
        $code = [int]$r.StatusCode
        $body = $r.Content | ConvertFrom-Json
    } catch {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
            try { $body = $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
        }
    }
    $ok = ($code -eq $case.code) -and $null -ne $body -and (& $case.check $body)
    if ($ok) { Write-Host "PASS $($case.name) HTTP=$code" }
    else { $failed++; Write-Host "FAIL $($case.name) HTTP=$code expected=$($case.code)" }
}
Write-Host "Passed $($cases.Count - $failed)/$($cases.Count)"
if ($failed -gt 0) { exit 1 }
exit 0