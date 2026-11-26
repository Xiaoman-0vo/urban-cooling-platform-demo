param(
    [string]$WorkflowFile = 'workflows\03-demand-agent-api.json',
    [string]$BaseName = '',
    [string]$ContainerName = '',
    [string]$BaseUrl = '',
    [switch]$NoRestart
)
# 工作流身份以 JSON 中的 name 为准；BaseName 保留旧调用兼容。
$nodeArgs = @((Join-Path $PSScriptRoot 'deploy-workflow.mjs'), '--workflow', $WorkflowFile)
if ($ContainerName) { $nodeArgs += @('--container', $ContainerName) }
if ($BaseUrl) { $nodeArgs += @('--base-url', $BaseUrl) }
if ($NoRestart) { $nodeArgs += '--no-restart' }
& node @nodeArgs
exit $LASTEXITCODE