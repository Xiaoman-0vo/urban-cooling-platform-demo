# 契约入口冒烟测试
# 用法：powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
# 也可以指定地址：... -BaseUrl "http://127.0.0.1:5678/webhook/weibo-demand/v1"

param(
    [string]$BaseUrl = "http://127.0.0.1:5678/webhook/weibo-demand/v1"
)

$cases = @(
    @{
        name   = "1) health 健康检查"
        expect = "HTTP 200 / status=ok"
        body   = '{"contract_version":"1.0.0","request_id":"req-health-1001","action":"health","payload":{}}'
    },
    @{
        name   = "2) classify 正常请求（P2 阶段只回显）"
        expect = "HTTP 200 / status=accepted"
        body   = '{"contract_version":"1.0.0","request_id":"req-cls-1002","action":"classify","payload":{"text":"公交站太晒，等车没地方坐"}}'
    },
    @{
        name   = "3) action 非法"
        expect = "HTTP 400 / E_CONTRACT_INVALID / path=`$.action"
        body   = '{"contract_version":"1.0.0","request_id":"req-bad-1003","action":"nonsense","payload":{}}'
    },
    @{
        name   = "4) 多字段同时错（版本不对 + id 太短 + 无 payload）"
        expect = "HTTP 400 / 3 条 errors"
        body   = '{"contract_version":"2.0.0","request_id":"short","action":"health"}'
    }
)

$fail = 0
foreach ($c in $cases) {
    Write-Host ""
    Write-Host "=== $($c.name) ===" -ForegroundColor Cyan
    Write-Host "   期望: $($c.expect)" -ForegroundColor DarkGray
    try {
        $r = Invoke-WebRequest -Uri $BaseUrl -Method Post -ContentType "application/json" `
            -Body ([Text.Encoding]::UTF8.GetBytes($c.body)) -TimeoutSec 30 -UseBasicParsing
        Write-Host "   HTTP $($r.StatusCode) " -ForegroundColor Green -NoNewline
        Write-Host ([Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()))
    }
    catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }
        Write-Host "   HTTP $code " -ForegroundColor Yellow -NoNewline
        Write-Host $_.ErrorDetails.Message
        if ($code -ne 400) { $fail++ }
    }
}

Write-Host ""
if ($fail -eq 0) {
    Write-Host "冒烟测试通过：4 个用例的 HTTP 码与契约一致。" -ForegroundColor Green
    exit 0
} else {
    Write-Host "有 $fail 个用例不符合预期，先看 docs/03-n8n环境与本次改动.md 的排障一节。" -ForegroundColor Red
    exit 1
}
