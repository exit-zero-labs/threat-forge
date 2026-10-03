# CI-only package smoke verification; administrative MSI extraction is not owner install validation.
param(
    [Parameter(Mandatory)][string]$TargetRoot,
    [Parameter(Mandatory)][string]$EvidenceDirectory
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-signing-tools.ps1')

# Reject missing and ambiguous package/payload matches instead of verifying a convenient file.
function Get-SingleFile {
    param([string]$Directory, [string]$Filter, [switch]$Recurse)
    $files = @(Get-ChildItem -LiteralPath $Directory -Filter $Filter -File -Recurse:$Recurse)
    if ($files.Count -ne 1) { throw "Expected exactly one $Filter in $Directory; found $($files.Count)." }
    return $files[0].FullName
}

# NSIS uses an unquoted trailing directory argument; the generated paths are controlled CI scratch paths.
function Invoke-PackageProcess {
    param([string]$Path, [string]$Arguments)
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Package operation failed with exit code $($process.ExitCode)." }
}

$smoke = $null
$uninstaller = $null
$transcript = $false
try {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
        throw 'Package execution is restricted to disposable GitHub-hosted Windows runners.'
    }
    $tool = Get-ThreatForgeSignTool
    $target = (Resolve-Path -LiteralPath $TargetRoot).ProviderPath
    New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
    Start-Transcript -LiteralPath (Join-Path $EvidenceDirectory 'windows-signing-verification.txt') | Out-Null
    $transcript = $true
    $main = Join-Path $target 'threat-forge.exe'
    $helper = Join-Path $target 'threatforge-mcp.exe'
    $nsis = Get-SingleFile -Directory (Join-Path $target 'bundle/nsis') -Filter '*.exe'
    $msi = Get-SingleFile -Directory (Join-Path $target 'bundle/msi') -Filter '*.msi'
    foreach ($file in @($main, $helper, $nsis, $msi)) {
        Assert-ThreatForgeSignature -FilePath $file -SignTool $tool
    }
    $smoke = Join-Path $env:RUNNER_TEMP ('threatforge-package-smoke-' + [guid]::NewGuid().ToString())
    $nsisRoot = Join-Path $smoke 'nsis'
    $msiRoot = Join-Path $smoke 'msi'
    New-Item -ItemType Directory -Path $smoke | Out-Null
    Invoke-PackageProcess -Path $nsis -Arguments "/S /D=$nsisRoot"
    # Locate before payload verification so cleanup still runs if a payload fails verification.
    $candidateUninstaller = Get-SingleFile -Directory $nsisRoot -Filter '*uninstall*.exe' -Recurse
    Assert-ThreatForgeSignature -FilePath $candidateUninstaller -SignTool $tool
    $uninstaller = $candidateUninstaller
    foreach ($name in @('threat-forge.exe', 'threatforge-mcp.exe')) {
        $payload = Get-SingleFile -Directory $nsisRoot -Filter $name -Recurse
        Assert-ThreatForgeSignature -FilePath $payload -SignTool $tool
    }
    Invoke-PackageProcess -Path $uninstaller -Arguments "/S _?=$nsisRoot"
    $uninstaller = $null
    $msiexec = Join-Path $env:WINDIR 'System32/msiexec.exe'
    Invoke-PackageProcess -Path $msiexec -Arguments "/a `"$msi`" /qn /norestart TARGETDIR=`"$msiRoot`""
    foreach ($name in @('threat-forge.exe', 'threatforge-mcp.exe')) {
        $payload = Get-SingleFile -Directory $msiRoot -Filter $name -Recurse
        Assert-ThreatForgeSignature -FilePath $payload -SignTool $tool
    }
    $hashes = foreach ($file in @($main, $helper, $nsis, $msi)) {
        @{ Name = [IO.Path]::GetFileName($file); SHA256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash }
    }
    $hashes | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'windows-signed-sha256.json')
    Write-Host 'NSIS installed payload/uninstaller and MSI administrative payload signatures verified.'
} finally {
    try {
        if ($uninstaller) {
            Invoke-PackageProcess -Path $uninstaller -Arguments "/S _?=$nsisRoot"
        }
    } finally {
        if ($smoke -and (Test-Path -LiteralPath $smoke)) { Remove-Item -LiteralPath $smoke -Recurse -Force }
        if ($transcript) { Stop-Transcript | Out-Null }
    }
}
