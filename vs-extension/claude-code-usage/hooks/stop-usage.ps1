param()
try {
    # Resolve this account's config dir from the script location:
    # <configDir>\hooks\stop-usage.ps1  ->  <configDir>
    $configDir = Split-Path $PSScriptRoot -Parent

    $stdin = [Console]::In.ReadToEnd()
    if ($stdin) {
        $data = $stdin | ConvertFrom-Json
        $transcriptPath = $data.transcript_path

        # --- Token usage from transcript ---
        if ($transcriptPath -and (Test-Path $transcriptPath)) {
            $lines = Get-Content $transcriptPath -Tail 300 -Encoding utf8
            $lastUsage = $null
            foreach ($line in $lines) {
                if (-not $line -or $line.Trim() -eq '') { continue }
                try {
                    $obj = $line | ConvertFrom-Json
                    $usage = $null
                    if ($obj.message -and $obj.message.usage) { $usage = $obj.message.usage }
                    elseif ($obj.usage) { $usage = $obj.usage }
                    if ($usage -and ($usage.input_tokens -or $usage.output_tokens)) { $lastUsage = $usage }
                } catch {}
            }
            if ($lastUsage) {
                $inTok  = if ($null -ne $lastUsage.input_tokens)  { [int]$lastUsage.input_tokens }  else { 0 }
                $outTok = if ($null -ne $lastUsage.output_tokens) { [int]$lastUsage.output_tokens } else { 0 }
                $cacheR = if ($null -ne $lastUsage.cache_read_input_tokens)     { [int]$lastUsage.cache_read_input_tokens }     else { 0 }
                $cacheW = if ($null -ne $lastUsage.cache_creation_input_tokens) { [int]$lastUsage.cache_creation_input_tokens } else { 0 }
                $tokenOutput = [ordered]@{
                    input_tokens          = $inTok
                    output_tokens         = $outTok
                    cache_read_tokens     = $cacheR
                    cache_creation_tokens = $cacheW
                    updated_at            = (Get-Date -Format 'o')
                }
                $tokenPath = Join-Path $configDir 'usage-current.json'
                $json = $tokenOutput | ConvertTo-Json
                [System.IO.File]::WriteAllText($tokenPath, $json, [System.Text.UTF8Encoding]::new($false))
            }
        }
    }

    # --- Plan usage from Claude API (credentials read from this account's dir) ---
    $credPath = Join-Path $configDir '.credentials.json'
    if (Test-Path $credPath) {
        $creds = Get-Content $credPath -Raw | ConvertFrom-Json
        $token = $null
        # Try common credential field names
        if ($creds.claudeAiOauth -and $creds.claudeAiOauth.accessToken) {
            $token = $creds.claudeAiOauth.accessToken
        } elseif ($creds.access_token) {
            $token = $creds.access_token
        } elseif ($creds.accessToken) {
            $token = $creds.accessToken
        }

        if ($token) {
            try {
                $headers = @{
                    "Authorization" = "Bearer $token"
                    "Content-Type"  = "application/json"
                }
                $response = Invoke-RestMethod -Uri "https://api.anthropic.com/api/oauth/usage" -Headers $headers -TimeoutSec 5 -Method Get
                $fiveHour = $response.five_hour
                $sevenDay = $response.seven_day
                function ConvertTo-Pct($v) {
                    if ($null -eq $v) { return 0 }
                    $d = [double]$v
                    # API returns 0-100 range; guard against legacy 0-1 scale
                    if ($d -le 1.0) { return [int]([math]::Round($d * 100)) }
                    return [int]([math]::Round($d))
                }
                function ConvertTo-Unix($v) {
                    if ($null -eq $v) { return 0 }
                    try { return [long]$v } catch {}
                    try { return [long][System.DateTimeOffset]::Parse($v).ToUnixTimeSeconds() } catch {}
                    return 0
                }
                if ($fiveHour -or $sevenDay) {
                    $spendPct = 0; $spendUsed = 0.0; $spendLimit = 0.0; $spendSev = 'normal'
                    if ($response.spend -and $response.spend.enabled) {
                        $spendPct = if ($null -ne $response.spend.percent) { [int]$response.spend.percent } else { 0 }
                        $exp = if ($null -ne $response.spend.used.exponent) { [int]$response.spend.used.exponent } else { 2 }
                        $div = [math]::Pow(10, $exp)
                        $spendUsed  = if ($null -ne $response.spend.used.amount_minor)  { [math]::Round($response.spend.used.amount_minor / $div, 2) }  else { 0.0 }
                        $spendLimit = if ($null -ne $response.spend.limit.amount_minor) { [math]::Round($response.spend.limit.amount_minor / $div, 2) } else { 0.0 }
                        $spendSev   = if ($response.spend.severity) { [string]$response.spend.severity } else { 'normal' }
                    }
                    $planOutput = [ordered]@{
                        session_used_pct  = ConvertTo-Pct  ($fiveHour.utilization)
                        session_resets_at = ConvertTo-Unix ($fiveHour.resets_at)
                        weekly_used_pct   = ConvertTo-Pct  ($sevenDay.utilization)
                        weekly_resets_at  = ConvertTo-Unix ($sevenDay.resets_at)
                        spend_pct         = $spendPct
                        spend_used        = $spendUsed
                        spend_limit       = $spendLimit
                        spend_severity    = $spendSev
                        updated_at        = (Get-Date -Format 'o')
                    }
                    $planPath = Join-Path $configDir 'plan-usage.json'
                    $planJson = $planOutput | ConvertTo-Json
                    [System.IO.File]::WriteAllText($planPath, $planJson, [System.Text.UTF8Encoding]::new($false))
                }
            } catch {}
        }
    }
} catch {}
exit 0
