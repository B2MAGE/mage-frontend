# Submission policy corpus

`builtin-presets.json` and `demo-quality.json` are exact copies of the PP-V01
backend test resources under `src/test/resources/scene-corpus/`. They contain
the 16 immutable template engine payloads and 100 quality demo scenes accepted
by the Java submission policy. They are test data, never runtime inputs.

The authoritative policy copy is `contracts/scenes/scene-limits.v1.json` and
matches backend `src/main/resources/scene-limits.v1.json`. Keep both repositories
in sync when changing the policy. Existing template conformance fixtures remain
in `contracts/scenes/fixtures.json`; structural contract validity alone does not
imply that a custom document satisfies submission limits.
