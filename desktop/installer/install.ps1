<#
.SYNOPSIS
  Installs YourPDF Desktop from GitHub Releases.

.DESCRIPTION
  Downloads YourPDF-Desktop-setup.exe and SHA256SUMS.txt, verifies the hash,
  runs the per-user NSIS installer silently, and launches the app.

  One command (Windows PowerShell):

    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/unknown-spec10/YourPDF/releases/latest/download/install.ps1 | iex"

  Offline: put install.ps1 next to YourPDF-Desktop-setup.exe and SHA256SUMS.txt,
  then run it. No network access is needed in that case.

  The build is unsigned, so Windows SmartScreen may ask you to confirm the
  first launch. That prompt is expected; code signing is not part of v1.

.PARAMETER Version
  Release tag to install, e.g. 0.1.0 or v0.1.0. Defaults to the latest release.

.PARAMETER NoLaunch
  Install without starting the app.

.PARAMETER NoInstall
  Download and verify only. Useful for testing the download path.
#>
[CmdletBinding()]
param(
    [string]$Version = "latest",
    [switch]$NoLaunch,
    [switch]$NoInstall
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repo = "unknown-spec10/YourPDF"
$AppName = "YourPDF Desktop"
$ExeName = "YourPDF Desktop.exe"
$SetupName = "YourPDF-Desktop-setup.exe"

# PowerShell 5.1 defaults to TLS 1.0 on older Windows builds.
[Net.ServicePointManager]::SecurityProtocol = `
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Find-LocalInstaller {
    if (-not $PSScriptRoot) { return $null }

    # Release pages ship the stable name; local rebuilds also have a versioned
    # file. Accept either, preferring an exact version when one was requested.
    $stable = Join-Path $PSScriptRoot "YourPDF-Desktop-setup.exe"
    $files = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter "YourPDF-Desktop-*-setup.exe" -File -ErrorAction SilentlyContinue)

    if ($Version -ne "latest") {
        $wanted = "YourPDF-Desktop-$($Version.TrimStart('v'))-setup.exe"
        $match = $files | Where-Object { $_.Name -eq $wanted } | Select-Object -First 1
        if ($match) { return $match }
        if (Test-Path -LiteralPath $stable) {
            Write-Warning "No $wanted next to this script; using $stable instead."
            return Get-Item -LiteralPath $stable
        }
        return $null
    }

    if (Test-Path -LiteralPath $stable) { return Get-Item -LiteralPath $stable }
    if ($files.Count -eq 0) { return $null }
    return ($files | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
}

function Find-InstalledApp {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\$AppName\$ExeName"),
        (Join-Path $env:LOCALAPPDATA "Programs\YourPDF-Desktop\$ExeName"),
        (Join-Path $env:LOCALAPPDATA "Programs\yourpdf-desktop\$ExeName")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    $uninstallRoots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($root in $uninstallRoots) {
        $entry = Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq $AppName } |
            Select-Object -First 1
        if (-not $entry) { continue }
        if ($entry.InstallLocation) {
            $path = Join-Path $entry.InstallLocation $ExeName
            if (Test-Path -LiteralPath $path) { return $path }
        }
        if ($entry.DisplayIcon) {
            $path = ($entry.DisplayIcon -replace ',\d+$', '').Trim('"')
            if (Test-Path -LiteralPath $path) { return $path }
        }
    }

    $programs = Join-Path $env:LOCALAPPDATA "Programs"
    if (Test-Path -LiteralPath $programs) {
        $found = Get-ChildItem -LiteralPath $programs -Filter $ExeName -Recurse -File -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("yourpdf-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
    $local = Find-LocalInstaller
    if ($local) {
        $setup = $local.FullName
        $sums = Join-Path $local.DirectoryName "SHA256SUMS.txt"
        if (-not (Test-Path -LiteralPath $sums)) {
            throw "SHA256SUMS.txt is missing next to $($local.Name). Download a complete release bundle."
        }
        Write-Step "Using local installer $($local.Name)"
    } else {
        if ($Version -eq "latest") {
            $base = "https://github.com/$Repo/releases/latest/download"
        } else {
            $tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
            $base = "https://github.com/$Repo/releases/download/$tag"
        }

        $setup = Join-Path $tempDir $SetupName
        $sums = Join-Path $tempDir "SHA256SUMS.txt"

        Write-Step "Downloading $SetupName (about 300 MB)..."
        Invoke-WebRequest -Uri "$base/$SetupName" -OutFile $setup -UseBasicParsing
        Invoke-WebRequest -Uri "$base/SHA256SUMS.txt" -OutFile $sums -UseBasicParsing
    }

    Write-Step "Verifying SHA-256..."
    $name = Split-Path $setup -Leaf
    $line = Get-Content -LiteralPath $sums |
        Where-Object { $_ -match ('^[0-9a-fA-F]{64}\s+\*?' + [regex]::Escape($name) + '$') } |
        Select-Object -First 1
    if (-not $line) { throw "No checksum entry for $name in SHA256SUMS.txt." }

    $expected = ($line -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $actual) {
        throw "Checksum mismatch for $name. Expected $expected, got $actual. Do not run this file."
    }
    Write-Step "Checksum OK"

    if ($NoInstall) {
        Write-Host "Verified installer: $setup"
        return
    }

    Write-Step "Installing $AppName for the current user (no admin required)..."
    Unblock-File -LiteralPath $setup -ErrorAction SilentlyContinue
    $proc = Start-Process -FilePath $setup -ArgumentList "/S" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        throw "Installer exited with code $($proc.ExitCode)."
    }

    $deadline = (Get-Date).AddSeconds(90)
    $app = Find-InstalledApp
    while (-not $app -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $app = Find-InstalledApp
    }
    if (-not $app) {
        throw "Install finished, but $ExeName was not found. Check Settings > Apps, or run the installer manually."
    }

    Write-Step "Installed at $app"
    if (-not $NoLaunch) {
        Start-Process -FilePath $app
        Write-Step "Launched $AppName"
    }
    Write-Host ""
    Write-Host "Done. Files never leave this machine." -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $tempDir) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
