# Builds signed release artifacts and stages them in release\.
#
# Every Play Store upload must come from release\ - never from
# build\app\outputs\, which is wiped by `flutter clean` and holds unversioned
# filenames that are easy to mix up between builds.
#
# Usage:
#   .\tool\release.ps1              # build AAB + APK for the current pubspec version
#   .\tool\release.ps1 -Clean       # flutter clean first
#   .\tool\release.ps1 -AabOnly     # skip the APK

[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$AabOnly
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- preconditions ---------------------------------------------------------

if (-not (Test-Path 'android\key.properties')) {
    throw 'android\key.properties missing - release builds would be signed with the debug key.'
}

$versionLine = Select-String -Path 'pubspec.yaml' -Pattern '^version:\s*(.+)$' | Select-Object -First 1
if (-not $versionLine) { throw 'No version: line found in pubspec.yaml.' }

$version = $versionLine.Matches[0].Groups[1].Value.Trim()
$versionName, $buildNumber = $version -split '\+', 2
if (-not $buildNumber) { throw "pubspec version '$version' has no +buildNumber." }

$stem = "ai-patro-v$versionName-$buildNumber"
$releaseDir = Join-Path $root 'release'
if (-not (Test-Path $releaseDir)) { New-Item -ItemType Directory $releaseDir | Out-Null }

$aabDest = Join-Path $releaseDir "$stem.aab"
if (Test-Path $aabDest) {
    throw "$aabDest already exists - bump the version in pubspec.yaml before rebuilding."
}

Write-Host "Releasing $versionName (build $buildNumber)"

# --- build -----------------------------------------------------------------

if ($Clean) { flutter clean; if ($LASTEXITCODE -ne 0) { throw 'flutter clean failed.' } }

flutter build appbundle --release
if ($LASTEXITCODE -ne 0) { throw 'flutter build appbundle failed.' }
Copy-Item 'build\app\outputs\bundle\release\app-release.aab' $aabDest -Force

if (-not $AabOnly) {
    flutter build apk --release
    if ($LASTEXITCODE -ne 0) { throw 'flutter build apk failed.' }
    Copy-Item 'build\app\outputs\flutter-apk\app-release.apk' (Join-Path $releaseDir "$stem.apk") -Force
}

# --- report ----------------------------------------------------------------

Write-Host ''
Write-Host "Staged in release\ - upload the .aab from there:"
Get-ChildItem $releaseDir -Filter "$stem.*" | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 1)
    $sha = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.Substring(0, 16)
    Write-Host ("  {0}  {1} MB  sha256:{2}..." -f $_.Name, $mb, $sha)
}
