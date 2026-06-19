$credPath = Join-Path $env:USERPROFILE '.claude\.credentials.json'
$creds = Get-Content $credPath -Raw | ConvertFrom-Json
$token = $creds.claudeAiOauth.accessToken

$r = Invoke-RestMethod -Uri 'https://api.anthropic.com/api/oauth/usage' `
    -Headers @{ Authorization="Bearer $token"; 'Content-Type'='application/json' } `
    -Method Get

$r | ConvertTo-Json -Depth 10
