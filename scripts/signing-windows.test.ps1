# Run on Windows with: pwsh -NoProfile -File scripts/signing-windows.test.ps1
# These negative integration checks never contact Azure or sign a file.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This harness requires Windows.' }
$root = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$signer = Join-Path $PSScriptRoot 'sign-windows.ps1'
$oldDlib = $env:DLIB_PATH
$oldMetadata = $env:SIGNING_METADATA_PATH
$oldSdk = ${env:ProgramFiles(x86)}
try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $target = Join-Path $root 'target with spaces.exe'
    $dlib = Join-Path $root 'test dlib.dll'
    $metadata = Join-Path $root 'test metadata.json'
    Set-Content -LiteralPath $target 'Not a signed executable'
    Set-Content -LiteralPath $dlib 'Not an executable library'
    Set-Content -LiteralPath $metadata '{}'
    . (Join-Path $PSScriptRoot 'windows-signing-tools.ps1')
    # Mock only the native verification and certificate query boundaries. These are
    # rejection tests, never proof that a real file or Azure identity is trusted.
    function Test-SignTool { $global:LASTEXITCODE = $script:verifyExit }
    function Get-AuthenticodeSignature { return $script:fixtureSignature }
    $script:verifyExit = 1
    $script:fixtureSignature = @{ Status = 'Valid'; SignerCertificate = $null; TimeStamperCertificate = $null }
    try { Assert-ThreatForgeSignature -FilePath $target -SignTool 'Test-SignTool'; throw 'Verifier accepted nonzero SignTool.' }
    catch { if (-not $_.Exception.Message.Contains('SignTool verification failed')) { throw } }
    $script:verifyExit = 0
    try { Assert-ThreatForgeSignature -FilePath $target -SignTool 'Test-SignTool'; throw 'Verifier accepted absent certificates.' }
    catch { if (-not $_.Exception.Message.Contains('timestamp certificate')) { throw } }
    $subject = [pscustomobject]@{}
    $subject | Add-Member -MemberType ScriptMethod -Name Decode -Value { param($flags) return "CN=Wrong Publisher`nO=Exit Zero Labs LLC`nL=Richmond`nS=Virginia`nC=US" }
    $script:fixtureSignature = @{ Status = 'Valid'; SignerCertificate = @{ SubjectName = $subject }; TimeStamperCertificate = [pscustomobject]@{ Present = $true } }
    try { Assert-ThreatForgeSignature -FilePath $target -SignTool 'Test-SignTool'; throw 'Verifier accepted wrong publisher.' }
    catch { if (-not $_.Exception.Message.Contains('Unexpected publisher subject field')) { throw } }
    # Exercise the production invocation boundary, retaining the real verifier.
    $script:toolCalls = [Collections.Generic.List[object]]::new()
    $script:signExit = 0
    function Test-SigningBoundary {
        $script:toolCalls.Add(@($args))
        $global:LASTEXITCODE = if ($args[0] -eq 'sign') { $script:signExit } else { $script:verifyExit }
    }
    $script:signExit = 9
    try {
        Invoke-ThreatForgeSigning -SignTool 'Test-SigningBoundary' -FilePath $target -DlibPath $dlib -MetadataPath $metadata
        throw 'Signer accepted a nonzero signing exit.'
    } catch { if (-not $_.Exception.Message.Contains('Artifact Signing failed')) { throw } }
    if ($script:toolCalls.Count -ne 1) { throw 'Verification ran after signing failed.' }
    $expectedArgs = @('sign', '/v', '/fd', 'SHA256', '/tr', 'http://timestamp.acs.microsoft.com/', '/td', 'SHA256', '/dlib', $dlib, '/dmdf', $metadata, $target)
    $actualArgs = $script:toolCalls[0]
    if ($actualArgs.Count -ne $expectedArgs.Count) { throw 'Signing argument count differs.' }
    for ($i = 0; $i -lt $expectedArgs.Count; $i++) {
        if ($actualArgs[$i] -cne $expectedArgs[$i]) { throw "Signing argument $i differs; literal path boundaries lost." }
    }
    $script:toolCalls.Clear()
    $script:signExit = 0
    $script:verifyExit = 7
    try {
        Invoke-ThreatForgeSigning -SignTool 'Test-SigningBoundary' -FilePath $target -DlibPath $dlib -MetadataPath $metadata
        throw 'Signer accepted a nonzero verification exit.'
    } catch { if (-not $_.Exception.Message.Contains('SignTool verification failed')) { throw } }
    if ($script:toolCalls.Count -ne 2) { throw 'Successful signing did not invoke exactly one verification.' }
    $expectedVerify = @('verify', '/pa', '/all', '/v', (Resolve-Path -LiteralPath $target).ProviderPath)
    $actualVerify = $script:toolCalls[1]
    if ($actualVerify.Count -ne $expectedVerify.Count) { throw 'Verification argument count differs.' }
    for ($i = 0; $i -lt $expectedVerify.Count; $i++) {
        if ($actualVerify[$i] -cne $expectedVerify[$i]) { throw "Verification argument $i differs." }
    }
    Write-Host 'PASS: exact signing/verification arguments, signing failure abort and verification failure propagation'
    Remove-Item Function:Get-AuthenticodeSignature
    Write-Host 'PASS: rejects native verification failure, missing certificates and wrong publisher'
    $env:DLIB_PATH = $dlib
    $env:SIGNING_METADATA_PATH = $metadata
    Push-Location (Join-Path $PSScriptRoot '../src-tauri')
    try {
        $cases = @(
            @{ Name = 'missing target'; Target = (Join-Path $root 'absent.exe'); Dlib = $dlib; Metadata = $metadata; Message = 'Signing target must identify an existing file' },
            @{ Name = 'missing dlib'; Target = $target; Dlib = (Join-Path $root 'absent.dll'); Metadata = $metadata; Message = 'DLIB_PATH must identify an existing file' },
            @{ Name = 'missing metadata'; Target = $target; Dlib = $dlib; Metadata = (Join-Path $root 'absent.json'); Message = 'Signing metadata must identify an existing file' }
        )
        foreach ($case in $cases) {
            $env:DLIB_PATH = $case.Dlib
            $env:SIGNING_METADATA_PATH = $case.Metadata
            $output = & pwsh -NoProfile -NonInteractive -File $signer $case.Target 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0 -or -not $output.Contains($case.Message)) { throw "Failed case: $($case.Name)" }
            Write-Host "PASS: $($case.Name)"
        }
        $env:DLIB_PATH = $dlib
        $env:SIGNING_METADATA_PATH = $metadata
        ${env:ProgramFiles(x86)} = $root
        New-Item -ItemType Directory -Path (Join-Path $root 'Windows Kits/10/bin') -Force | Out-Null
        $output = & pwsh -NoProfile -NonInteractive -File $signer $target 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0 -or -not $output.Contains('Install Windows SDK')) { throw 'Failed case: missing SDK' }
        Write-Host 'PASS: missing SDK with literal target containing spaces'
    } finally { Pop-Location }
} finally {
    $env:DLIB_PATH = $oldDlib
    $env:SIGNING_METADATA_PATH = $oldMetadata
    ${env:ProgramFiles(x86)} = $oldSdk
    Remove-Item -LiteralPath $root -Recurse -Force
}

# Expected child-process failures must not become the successful harness's exit code.
exit 0
