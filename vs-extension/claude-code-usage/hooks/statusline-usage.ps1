param()
try {
    $rawJson = [Console]::In.ReadToEnd()
    if (-not $rawJson) { exit 0 }

    $data = $rawJson | ConvertFrom-Json

    $inputTok  = $data.context_window.total_input_tokens
    $outputTok = $data.context_window.total_output_tokens
    $usedPct   = $data.context_window.used_percentage
    $costUsd   = $data.cost.total_cost_usd

    function Format-Tokens($n) {
        if ($null -eq $n -or $n -eq 0) { return "0" }
        if ($n -ge 1000) { return ("{0:N1}k" -f ($n / 1000)) }
        return "$n"
    }

    $inFmt  = Format-Tokens $inputTok
    $outFmt = Format-Tokens $outputTok

    $pct = if ($null -ne $usedPct) {
        $v = [double]$usedPct
        if ($v -le 1.0) { [math]::Round($v * 100) } else { [math]::Round($v) }
    } else { 0 }

    $costStr = if ($null -ne $costUsd -and [double]$costUsd -gt 0) {
        '$' + ("{0:N4}" -f [double]$costUsd)
    } else { '$0.0000' }

    $pctStr = "${pct}%"
    Write-Output "in:$inFmt out:$outFmt | ctx:$pctStr | $costStr"

    # Write plan usage for VS Code extension
    if ($data.rate_limits) {
        $fiveHour = $data.rate_limits.five_hour
        $sevenDay = $data.rate_limits.seven_day
        $plan = [ordered]@{
            session_used_pct  = if ($fiveHour) { [int]$fiveHour.used_percentage } else { 0 }
            session_resets_at = if ($fiveHour) { [long]$fiveHour.resets_at } else { 0 }
            weekly_used_pct   = if ($sevenDay) { [int]$sevenDay.used_percentage } else { 0 }
            weekly_resets_at  = if ($sevenDay) { [long]$sevenDay.resets_at } else { 0 }
            updated_at        = (Get-Date -Format 'o')
        }
        $outPath = Join-Path $env:USERPROFILE '.claude\plan-usage.json'
        $json = $plan | ConvertTo-Json
        [System.IO.File]::WriteAllText($outPath, $json, [System.Text.UTF8Encoding]::new($false))
    }
} catch {
    Write-Output "usage:err"
}
