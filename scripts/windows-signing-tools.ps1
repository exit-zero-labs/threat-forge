# Shared release signer/verifier boundary. These functions throw on any failed check.

# Resolve a supported x64 Windows SDK SignTool without trusting PATH.
function Get-ThreatForgeSignTool {
    if (-not $IsWindows -or -not [Environment]::Is64BitProcess) {
        throw 'Verification requires Windows and x64 PowerShell 7.'
    }
    # Resolve the SDK tool explicitly: PATH may contain an incompatible SignTool.
    # Microsoft's documented minimum has a shortened build number; 20348 is excluded.
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
    $sdk = Get-ChildItem -LiteralPath $sdkRoot -Directory |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' -and [version]$_.Name -ge [version]'10.0.22621.0' } |
        Sort-Object { [version]$_.Name } -Descending |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'x64/signtool.exe') -PathType Leaf } |
        Select-Object -First 1
    if (-not $sdk) { throw 'Install Windows SDK 10.0.22621.0 or newer with x64 SignTool.' }
    $signTool = Join-Path $sdk.FullName 'x64/signtool.exe'
    $toolVersion = (Get-Item -LiteralPath $signTool).VersionInfo
    $version = [version]::new($toolVersion.FileMajorPart, $toolVersion.FileMinorPart, $toolVersion.FileBuildPart, $toolVersion.FilePrivatePart)
    if ($version -lt [version]'10.0.2261.755') { throw 'SignTool is older than the Artifact Signing minimum.' }
    return $signTool
}

# Require trusted Authenticode, the legal publisher fields, and an RFC 3161 timestamp.
function Assert-ThreatForgeSignature {
    param([Parameter(Mandatory)][string]$FilePath, [Parameter(Mandatory)][string]$SignTool)
    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { throw "Required signed file is missing: $FilePath" }
    $target = (Resolve-Path -LiteralPath $FilePath).ProviderPath
    & $SignTool verify /pa /all /v $target
    if ($LASTEXITCODE -ne 0) { throw 'SignTool verification failed.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $target
    if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or -not $signature.TimeStamperCertificate) {
        throw 'A valid Authenticode signature and timestamp certificate are required.'
    }
    # Decode distinguished names independently of certificate display ordering.
    $subject = $signature.SignerCertificate.SubjectName.Decode([System.Security.Cryptography.X509Certificates.X500DistinguishedNameFlags]::UseNewLines)
    $fields = @{}
    foreach ($line in ($subject -split '\r?\n')) {
        if ($line -match '^([^=]+)=(.*)$') {
            $name = $Matches[1].Trim()
            if ($fields.ContainsKey($name)) { throw 'Duplicate publisher subject field.' }
            $fields[$name] = $Matches[2].Trim().Trim('"')
        }
    }
    foreach ($expected in @{ CN = 'Exit Zero Labs LLC'; O = 'Exit Zero Labs LLC'; L = 'Richmond'; S = 'Virginia'; C = 'US' }.GetEnumerator()) {
        if (-not $fields.ContainsKey($expected.Key) -or $fields[$expected.Key] -cne $expected.Value) {
            throw "Unexpected publisher subject field: $($expected.Key)."
        }
    }
    Write-Host "Verified Exit Zero Labs LLC signature and timestamp: $target"
}

# Invoke Artifact Signing with literal argument boundaries, then require verification.
function Invoke-ThreatForgeSigning {
    param(
        [Parameter(Mandatory)][string]$SignTool,
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string]$DlibPath,
        [Parameter(Mandatory)][string]$MetadataPath
    )
    & $SignTool sign /v /fd SHA256 /tr 'http://timestamp.acs.microsoft.com/' /td SHA256 /dlib $DlibPath /dmdf $MetadataPath $FilePath
    if ($LASTEXITCODE -ne 0) { throw 'Artifact Signing failed.' }
    Assert-ThreatForgeSignature -FilePath $FilePath -SignTool $SignTool
}
