# Reproducible GetFlow Trigger tool

This is a private deployment tool, not a new application. It never logs in or deploys during verification. Plain `npx trigger.dev@4.8.1` is not this hardened artifact.

- Runtime: exact Node **22.23.4**, pinned by `.node-version` and checked before patching. Windows x64 archive SHA256: `CBC74B5E0982C9DBB41525FD8FB5DCD32FBEE237863F7829072F4639A1CE5F20`.
- Manifest/lock: matched CLI and SDK **4.8.1**; no lifecycle hooks. Lock SHA256: `00A3870A556439EE1EB10B02BEF98DC5F0E88D8A862758BC79170663D7DF16CA`.
- Overrides: tar7.5.21, deepmerge-ts8.0.0, esbuild0.25.12, zod4.6.7, ws8.21.3, socket.io-client4.8.3.
- Versioned patch SHA256: `E66FB60DBE990F744B5A5E5DDA6577DFF72A0364F20FEA853929258E698CFA03`.
- Original `build/plugins.js`: `B600ABC9246DD442A58CDA39653A8123FC70BDF03BAFFC2FCE62CE34C1161AF6`; patched: `8519E16566E7BB3261DEC30C92501732EFCB23AB8067538388CBE0AE2C49A696`.

The patch requires SDK name/version metadata rather than mistaking an ESM marker for the SDK package. It also explicitly records the terminal newline added in the first experiment; the older patch omitted that byte. The original and final code hashes remain unchanged. Lockfile and patch are marked `-text` to preserve checksum-bound bytes on checkout.

From the isolated repository root, using the pinned runtime, with private writable proof/cache locations and no Production environment credentials:

```powershell
$env:GETFLOW_RELEASE_ROOT = (Get-Location).Path
$env:GETFLOW_TRIGGER_TOOL_ROOT = Join-Path $env:GETFLOW_RELEASE_ROOT 'tools/trigger-cli'
$env:GETFLOW_PROOF_DIR = '<new private proof directory outside Git>'
New-Item -ItemType Directory -Path $env:GETFLOW_PROOF_DIR
npm ci --prefix tools/trigger-cli --ignore-scripts --no-audit --no-fund
node tools/trigger-cli/apply-sdk-metadata-patch.cjs $env:GETFLOW_TRIGGER_TOOL_ROOT
npm audit --prefix tools/trigger-cli --json
node --test tools/trigger-cli/patch.test.cjs tools/trigger-cli/integrity.test.cjs tools/trigger-cli/cli-compatibility.test.cjs tools/trigger-cli/candidate-bundle.test.cjs tools/trigger-cli/runtime.test.cjs
node --test backend-nutritie-ai/tests/fixtures/triggerSdkRoutingProbe.cjs
```

Required project dependencies must already match the candidate backend lockfile. For a separate clean tool environment, copy only this manifest and lockfile, run scripts-disabled `npm ci` there, and set `GETFLOW_TRIGGER_TOOL_ROOT` to its absolute directory. Invoke the **versioned** applicator/tests from the repository. It rejects unknown source hashes, modified patches, OneDrive destinations and module links escaping the specified tool root. Reinstallation removes the patch; verification must follow every install.

Tests cover installed package versions/SRI declarations, patch rejection/idempotence, actual CLI config parsing, SDK detection, actual GetFlow task registration, both emitted worker bundles, controlled tar/giget extraction, default image/TLS configuration and duplicate build hashes. Output contains no provider result. Two builds must have the same content hash and all emitted file hashes; the archive must restore those files byte-for-byte. Use existing `backend-nutritie-ai/trigger.config.mjs` explicitly; CJS config loading is checked but the upstream CLI cannot rewrite `module.exports` in its build plugin.

CI has a dedicated credential-free job and OSV now includes this fourth lockfile. No security exception is added. Authenticated deploy/promotion, cloud image execution, existing queues, environment bindings and financial canaries remain separate release gates. No deployment command is authorized by this README.
