# 从本机 Edge 里取出微博登录 cookie，写入 .weibo-cookie / .weibo-cookie-web
#
# 为什么这么绕：Edge 140 把 cookie 升级成 v20（带应用绑定的加密），
# 外部程序拿 DPAPI 密钥解不开——只能让浏览器自己交出来，所以走 CDP。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\refresh-cookie.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\refresh-cookie.ps1 -LaunchEdge
#
# 前提：你在 Edge 里登录过 weibo.com（打开过 m.weibo.cn 并能看到自己头像）。
param(
    [switch]$LaunchEdge,
    [int]$Port = 9222
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Get-DebugUrl([int]$p) {
    try {
        $v = Invoke-RestMethod -Uri "http://127.0.0.1:$p/json/version" -TimeoutSec 3
        return $v.webSocketDebuggerUrl
    } catch { return $null }
}

$wsUrl = Get-DebugUrl $Port

if (-not $wsUrl) {
    if (-not $LaunchEdge) {
        Write-Host "Edge 没有开远程调试端口（$Port）。" -ForegroundColor Yellow
        Write-Host "两种办法："
        Write-Host "  1) 重新运行并加 -LaunchEdge：脚本会关掉 Edge 再用调试端口重开（会丢当前未保存的标签页状态）"
        Write-Host "  2) 自己关掉 Edge，然后执行："
        Write-Host "     & `"`$env:ProgramFiles`\Microsoft\Edge\Application\msedge.exe`" --remote-debugging-port=$Port"
        exit 1
    }
    Write-Host "正在关闭 Edge 并用调试端口重开 …"
    # 用 Stop-Process 而不是 taskkill：taskkill 在进程不存在时往 stderr 写东西，配合 StrictMode 会中断脚本
    Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    if (-not (Test-Path $edge)) { $edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" }
    if (-not (Test-Path $edge)) { throw "找不到 msedge.exe" }
    Start-Process $edge -ArgumentList "--remote-debugging-port=$Port", '--restore-last-session'
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        $wsUrl = Get-DebugUrl $Port
        if ($wsUrl) { break }
    }
    if (-not $wsUrl) { throw "Edge 起来了但调试端口 $Port 没响应" }
}

Write-Host "调试端口就绪：$wsUrl"

$nodeSrc = @'
const fs = require('fs');
const ws = new WebSocket(process.argv[2]);
const t = setTimeout(() => { console.error('CDP 超时'); process.exit(2); }, 15000);
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies', params: {} }));
ws.onerror = (e) => { console.error('CDP 连接失败: ' + (e.message || e)); process.exit(3); };
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id !== 1) return;
  clearTimeout(t);
  const all = m.result.cookies || [];
  function build(re) {
    const use = all.filter(c => re.test(c.domain) && c.path === '/');
    const byName = new Map();
    for (const c of use) { const p = byName.get(c.name); if (!p || c.domain.length > p.domain.length) byName.set(c.name, c); }
    return [...byName.values()].map(c => c.name + '=' + c.value).join('; ');
  }
  const mobile = build(/(^|\.)weibo\.cn$/);
  const web = build(/(^|\.)weibo\.com$/);
  fs.writeFileSync(process.argv[3], mobile, 'utf8');
  fs.writeFileSync(process.argv[4], web, 'utf8');
  const need = ['SUB', 'SUBP'];
  const missing = need.filter(n => !new RegExp('(^|; )' + n + '=').test(mobile));
  console.log('m.weibo.cn cookie: ' + mobile.split(';').length + ' 项 / ' + mobile.length + ' 字符');
  console.log('weibo.com  cookie: ' + web.split(';').length + ' 项 / ' + web.length + ' 字符');
  if (missing.length) { console.error('缺少登录态 cookie: ' + missing.join(', ') + '（请在 Edge 里登录微博后重试）'); process.exit(5); }
  console.log('登录态齐全（SUB/SUBP 都在）');
  ws.close(); process.exit(0);
};
'@

$tmpJs = Join-Path $env:TEMP 'weibo-cdp-cookies.js'
[System.IO.File]::WriteAllText($tmpJs, $nodeSrc, (New-Object System.Text.UTF8Encoding($false)))

node $tmpJs $wsUrl (Join-Path $root '.weibo-cookie') (Join-Path $root '.weibo-cookie-web')
$code = $LASTEXITCODE
Remove-Item $tmpJs -ErrorAction SilentlyContinue

if ($code -ne 0) { throw "取 cookie 失败（退出码 $code）" }
Write-Host "已写入 .weibo-cookie / .weibo-cookie-web" -ForegroundColor Green
Write-Host "提示：这两个文件已被 .gitignore 忽略，不要提交，也不要发到群里。"
