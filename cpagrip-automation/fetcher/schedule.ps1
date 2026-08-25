# Registers a Windows scheduled task that refreshes offers.json every 6 hours.
#
#   powershell -ExecutionPolicy Bypass -File fetcher\schedule.ps1 -PrivateKey "your_key"
#
# Remove it later with:  Unregister-ScheduledTask -TaskName CPAGripOfferFetch

param(
    [Parameter(Mandatory = $true)][string]$PrivateKey,
    [string]$TaskName = 'CPAGripOfferFetch',
    [int]$IntervalHours = 6
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot 'fetch_offers.js'
$node = (Get-Command node).Source

if (-not (Test-Path $script)) { throw "fetch_offers.js not found at $script" }

# The task needs the key in its own environment, so wrap the run in a shim that sets it.
$shim = Join-Path $PSScriptRoot 'run_fetch.cmd'
@"
@echo off
set CPAGRIP_PRIVATE_KEY=$PrivateKey
"$node" "$script" >> "$projectRoot\fetcher\fetch.log" 2>&1
"@ | Set-Content -Path $shim -Encoding ascii

$action = New-ScheduledTaskAction -Execute $shim -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Hours $IntervalHours)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Description 'Refresh CPAGrip offers.json' -Force | Out-Null

Write-Output "Registered task '$TaskName', running every $IntervalHours hours."
Write-Output "Shim: $shim (contains the private key - keep it off version control)"
Write-Output "Run it now with: Start-ScheduledTask -TaskName $TaskName"
