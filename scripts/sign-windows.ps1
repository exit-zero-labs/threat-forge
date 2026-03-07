# Windows code signing via Azure Trusted Signing
# Called by Tauri during build — receives file path as the last argument
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$FilePath
)

$dlibPath = $env:DLIB_PATH
$metadataPath = Join-Path $PSScriptRoot ".." "src-tauri" "trusted-signing-metadata.json"

if (-not $dlibPath) {
    Write-Error "DLIB_PATH environment variable not set"
    exit 1
}

if (-not (Test-Path $dlibPath)) {
    Write-Error "Azure.CodeSigning.Dlib.dll not found at: $dlibPath"
    exit 1
}

Write-Host "Signing: $FilePath"

& signtool sign /v /fd SHA256 /tr "http://timestamp.acs.microsoft.com" /td SHA256 /dlib "$dlibPath" /dmdf "$metadataPath" "$FilePath"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Signing failed for: $FilePath"
    exit 1
}

Write-Host "Signed successfully: $FilePath"
