# 把「Copy as cURL」粘出来的东西，自动清洗成 .weibo-cookie
# 用法（三种都行）：
#   1) 把 DevTools 里右键 → Copy → Copy as cURL (bash) 的内容存成 cookie-paste.txt，然后：
#        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\import-cookie.ps1
#   2) 直接粘一行裸 Cookie（SUB=...; SUBP=...）存成 cookie-paste.txt，同上
#   3) 先从 DevTools 右键 cookie 头的值 → Copy value 复制到剪贴板，然后：
#        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\import-cookie.ps1 -Clipboard
#
# 安全：本脚本只把值写进本机 .weibo-cookie（已 gitignore），屏幕上只打印 Cookie 名，不打印值。
param(
    [string]$From = 'cookie-paste.txt',
    [switch]$Clipboard,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outFile = Join-Path $root '.weibo-cookie'

# ---------- 1. 取原始文本 ----------
if ($Clipboard) {
    Add-Type -AssemblyName System.Windows.Forms
    $raw = [System.Windows.Forms.Clipboard]::GetText()
    $src = '剪贴板'
} else {
    $path = if ([IO.Path]::IsPathRooted($From)) { $From } else { Join-Path $root $From }
    if (-not (Test-Path $path)) {
        Write-Host "找不到 $path" -ForegroundColor Red
        Write-Host '请按 docs\04-采集适配器说明.md 第 2 节，把 Copy as cURL 的内容存成 cookie-paste.txt（放在项目根目录）。' -ForegroundColor Yellow
        exit 1
    }
    $raw = Get-Content $path -Raw -Encoding UTF8
    $src = (Split-Path $path -Leaf)
}

if (-not $raw -or $raw.Trim().Length -eq 0) {
    Write-Host "来源（$src）是空的。" -ForegroundColor Red
    exit 1
}

# ---------- 2. 抽出 cookie 字符串 ----------
$cookie = $null

# 2a. curl 形式： -H 'cookie: xxx'  或  -b 'xxx'  /  --cookie 'xxx'
$m = [regex]::Match($raw, "-H\s+['""]cookie:\s*([^'""]+)['""]", 'IgnoreCase')
if (-not $m.Success) { $m = [regex]::Match($raw, "(?:-b|--cookie)\s+['""]([^'""]+)['""]", 'IgnoreCase') }
if (-not $m.Success) {
    # 2b. 可能被换行折断：先拼接所有行再看
    $joined = ($raw -split "`r?`n") -join ' '
    $m = [regex]::Match($joined, "-H\s+['""]cookie:\s*([^'""]+)['""]", 'IgnoreCase')
    if (-not $m.Success) { $m = [regex]::Match($joined, "(?:-b|--cookie)\s+['""]([^'""]+)['""]", 'IgnoreCase') }
}
if ($m.Success) {
    $cookie = $m.Groups[1].Value
    Write-Host '识别为 curl 格式，已提取 cookie 头。' -ForegroundColor DarkGray
} else {
    # 2c. 裸 cookie：去前缀、去引号
    $cookie = $raw
    $cookie = $cookie -replace '(?im)^\s*cookie\s*:\s*', ''
    $cookie = $cookie.Trim().Trim('"').Trim("'")
    Write-Host '识别为裸 Cookie 文本。' -ForegroundColor DarkGray
}

# ---------- 3. 清洗 ----------
# 把所有空白（含换行）压成一个分号分隔的串；逐段去空段；去尾部分号
$cookie = $cookie -replace '\s*[\r\n]+\s*', '; '
$parts = $cookie -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
$cookie = ($parts -join '; ').TrimEnd(';').Trim()

$names = $parts | ForEach-Object { ($_ -split '=', 2)[0] }
$hasSub = $names -contains 'SUB'
$hasSubp = $names -contains 'SUBP'

Write-Host ''
Write-Host ("来源      : $src")
Write-Host ("长度      : {0} 字符" -f $cookie.Length)
Write-Host ("Cookie 项 : {0} 个" -f $names.Count)
Write-Host ("名称      : {0}" -f (($names | Select-Object -First 40) -join ', ')) -ForegroundColor DarkGray
Write-Host ("SUB       : {0}" -f $(if ($hasSub) { '有 ✅' } else { '缺失 ❌' })) -ForegroundColor $(if ($hasSub) { 'Green' } else { 'Red' })
Write-Host ("SUBP      : {0}" -f $(if ($hasSubp) { '有 ✅' } else { '缺失 ❌' })) -ForegroundColor $(if ($hasSubp) { 'Green' } else { 'Red' })

if (-not $hasSub -or -not $hasSubp) {
    Write-Host ''
    Write-Host 'Cookie 里缺 SUB 或 SUBP —— 这两个才是登录票据，缺了等于没登录。' -ForegroundColor Red
    Write-Host '原因通常是：① 页面没登录成功；② 复制的是 document.cookie（拿不到 HttpOnly 的 SUB/SUBP）。' -ForegroundColor Yellow
    Write-Host '改用 Network 面板右键请求 → Copy → Copy as cURL (bash)，再跑本脚本。' -ForegroundColor Yellow
    exit 1
}

if ($DryRun) {
    Write-Host ''
    Write-Host '（DryRun：未写文件）' -ForegroundColor Yellow
    exit 0
}

# ---------- 4. 写入（UTF-8 无 BOM，无换行）----------
try {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($outFile, $cookie, $enc)
} catch {
    Write-Host ("写文件失败：{0}" -f $_.Exception.Message) -ForegroundColor Red
    exit 1
}
$size = (Get-Item $outFile).Length
Write-Host ''
Write-Host ("已写入 {0}（{1} 字节，UTF-8 无 BOM）" -f $outFile, $size) -ForegroundColor Green
Write-Host '下一步：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\probe-weibo.ps1' -ForegroundColor Cyan
exit 0
