# Prepare the integrity-pinned signing client and metadata for the OIDC Azure CLI session.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

foreach ($name in @('RUNNER_TEMP', 'GITHUB_ENV', 'AZURE_TENANT_ID', 'AZURE_SUBSCRIPTION_ID', 'AZURE_ENDPOINT', 'AZURE_CODE_SIGNING_ACCOUNT_NAME', 'AZURE_CERTIFICATE_PROFILE_NAME')) {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Missing signing configuration: $name" }
}
$accountJson = & az account show --output json
if ($LASTEXITCODE -ne 0) { throw 'Azure OIDC login is required.' }
$account = $accountJson | ConvertFrom-Json
if ($account.tenantId -ne $env:AZURE_TENANT_ID -or $account.id -ne $env:AZURE_SUBSCRIPTION_ID) {
    throw 'Azure login does not match the protected signing tenant/subscription.'
}
if ($env:AZURE_ENDPOINT.TrimEnd('/') -ne 'https://eus.codesigning.azure.net' -or
    $env:AZURE_CODE_SIGNING_ACCOUNT_NAME -ne 'threatforge-signing' -or
    $env:AZURE_CERTIFICATE_PROFILE_NAME -ne 'threatforge-public') {
    throw 'Signing account/profile does not match the approved publisher configuration.'
}
$work = Join-Path $env:RUNNER_TEMP 'artifact-signing'
New-Item -ItemType Directory -Path $work -ErrorAction Stop | Out-Null
$package = Join-Path $work 'client.zip'
$uri = 'https://api.nuget.org/v3-flatcontainer/microsoft.artifactsigning.client/1.0.128/microsoft.artifactsigning.client.1.0.128.nupkg'
# SHA-512 from NuGet's immutable catalog entry, independently checked against package bytes.
$expectedHash = '98F06A691F4FC2FA22F19DCF8556733E98607FBEF91A312C453B9B0798CC9088DAE0ACB36E389B552A11B4D2320324785B8541C2B51091A724C05BC5DF5CBF95'
Invoke-WebRequest -Uri $uri -OutFile $package
if ((Get-FileHash -LiteralPath $package -Algorithm SHA512).Hash -ne $expectedHash) {
    throw 'Artifact Signing client integrity check failed.'
}
Expand-Archive -LiteralPath $package -DestinationPath (Join-Path $work 'client')
$dlib = Join-Path $work 'client/bin/x64/Azure.CodeSigning.Dlib.dll'
if (-not (Test-Path -LiteralPath $dlib -PathType Leaf)) { throw 'Verified package is missing the x64 signing library.' }
$metadata = Join-Path $work 'metadata.json'
@{
    Endpoint = $env:AZURE_ENDPOINT
    CodeSigningAccountName = $env:AZURE_CODE_SIGNING_ACCOUNT_NAME
    CertificateProfileName = $env:AZURE_CERTIFICATE_PROFILE_NAME
    ExcludeCredentials = @('EnvironmentCredential', 'WorkloadIdentityCredential', 'ManagedIdentityCredential', 'SharedTokenCacheCredential', 'VisualStudioCredential', 'VisualStudioCodeCredential', 'AzurePowerShellCredential', 'AzureDeveloperCliCredential', 'InteractiveBrowserCredential')
} | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $metadata -Encoding utf8
"DLIB_PATH=$dlib" | Out-File -LiteralPath $env:GITHUB_ENV -Append -Encoding utf8
"SIGNING_METADATA_PATH=$metadata" | Out-File -LiteralPath $env:GITHUB_ENV -Append -Encoding utf8
