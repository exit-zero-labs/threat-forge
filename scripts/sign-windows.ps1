# Tauri supplies one literal file path; signing and verification failures stop packaging.
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$FilePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-signing-tools.ps1')

try {
    if (-not $IsWindows -or -not [Environment]::Is64BitProcess) {
        throw 'Signing requires Windows and x64 PowerShell 7.'
    }
    foreach ($entry in @(
        @{ Name = 'Signing target'; Path = $FilePath },
        @{ Name = 'DLIB_PATH'; Path = $env:DLIB_PATH }
    )) {
        if (-not $entry.Path -or -not (Test-Path -LiteralPath $entry.Path -PathType Leaf)) {
            throw "$($entry.Name) must identify an existing file."
        }
    }
    $target = (Resolve-Path -LiteralPath $FilePath).ProviderPath
    $dlib = (Resolve-Path -LiteralPath $env:DLIB_PATH).ProviderPath
    $metadata = $env:SIGNING_METADATA_PATH
    if (-not $metadata) {
        if ($env:GITHUB_ACTIONS -eq 'true') {
            throw 'SIGNING_METADATA_PATH is required in GitHub Actions.'
        }
        $metadata = Join-Path $PSScriptRoot '../src-tauri/trusted-signing-metadata.json'
    }
    if (-not (Test-Path -LiteralPath $metadata -PathType Leaf)) {
        throw 'Signing metadata must identify an existing file.'
    }
    $metadata = (Resolve-Path -LiteralPath $metadata).ProviderPath

    $signTool = Get-ThreatForgeSignTool
    $dotnet = Join-Path $env:ProgramFiles 'dotnet/dotnet.exe'
    if (-not (Test-Path -LiteralPath $dotnet -PathType Leaf)) { throw 'Install the x64 .NET 8 runtime.' }
    $runtimes = & $dotnet --list-runtimes
    if ($LASTEXITCODE -ne 0 -or -not ($runtimes -match '^Microsoft\.NETCore\.App 8\.')) {
        throw 'Install the x64 .NET 8 runtime.'
    }

    Invoke-ThreatForgeSigning -SignTool $signTool -FilePath $target -DlibPath $dlib -MetadataPath $metadata
    exit 0
} catch {
    Write-Error -ErrorAction Continue "Windows signing failed: $($_.Exception.Message)"
    exit 1
}
