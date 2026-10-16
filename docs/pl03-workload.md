# PL-03: expanded shader workload checks

PL-03 estimates the work in the generated shader before the renderer submits it
to WebGL. A short program can perform excessive work through repeated helper
calls even when it contains no cycle. Object counts and source length alone do
not catch that case.

This is a conservative compatibility policy, not a GPU benchmark or a proof
against driver faults. Render size, device performance, driver behavior and
post-processing also affect frame time. Existing renderer pixel/frame limits and
isolation remain necessary. Original and Selective audio processing is unchanged.

## Policy version 1

The engine validates data shape and the pinned GLSL scaffold, then estimates the
generated geometry, shading and trusted renderer helpers together. Each repeated
call contributes its callee's cost again. Intrinsic costs cover vector/matrix and
transcendental operations; noise and primitive helpers include their own expanded
work. Trusted march, reflection, occlusion and fixed helper loops use their
reviewed bounds. Branches and same-arity trusted overloads are conservatively
summed rather than assuming only the cheapest route executes.

| Limit | Version-one maximum |
| --- | ---: |
| Generated snippet tokens | 60,000 |
| Generated functions | 512 |
| Delimiter nesting / call depth | 64 / 64 |
| Expanded work per generated function | 2,000,000 abstract units |
| Complete per-fragment work | 80,000,000 abstract units |
| March iterations / reflections | Existing 200 / 2 ceilings |

These units are neither milliseconds nor GPU instruction counts. The estimator
includes the configured march/reflection workload; it does not add a new quality
reduction. Existing byte, source, uniform and Builder limits remain enforced.
Bounded tokenization and iterative graph traversal avoid recursively expanding
source text. Addition/multiplication saturate at the budget rather than growing
unbounded numbers. Unknown calls/constructs, cyclic dependencies and over-budget
graphs fail closed before submission.

The compiler worker's result is data, not an assertion of safety. Its owner
recomputes validation on receipt and the engine repeats it when applying an
artifact. Extra fields claiming a cheap cost cannot bypass these checks.

The engine's `tests/fixtures/shader-workload.v1.json` is the companion versioned
accepted/rejected corpus. It covers finite amplification/overflow, cycles, unknown
constructs, excessive nesting and configured march/reflection multipliers. Those
cases are inspected as artifacts without sending them to the GPU.

When deployment is approved, deploy the compatible renderer
before the frontend. The frontend advertises the `workloadErrors` capability on
connection; an older strict renderer rejects that new field. The updated renderer
accepts older parents and retains their existing error vocabulary, allowing the
renderer-first transition. Merging the source and publishing the engine dependency
do not deploy either hosted application. PL-03 deployment remains deferred.

## Compatibility corpus

`contracts/scenes/shader-workload.v1.fixtures.json` records source and complete
compiled-artifact SHA-256 hashes produced before PL-03 with engine
`v1.0.4-mage.4`. The test compares the new engine's output against those hashes;
it cannot pass simply by silently reducing iterations or changing geometry to fit
the budget. Only GLSL newline spelling is canonicalized to LF: the released
package contains some CRLF while a local rebuild produces LF. Original raw
hashes were rechecked against the untouched released package before applying
this normalization. All other shader bytes and uniform definitions/values are
included in the canonical hash.

The version-one corpus contains 86 supported cases:

- All 14 original version-one templates.
- All 14 canonical editable Builder designs in saved and live-preview form
  (28 cases), including the existing music/pointer/combined-input designs.
- Those same saved and preview designs with the existing maximum 200 march
  iterations and minimum 0.005 step size (28 cases).
- Eight Builder boundary designs, each saved and previewed: empty; 16 objects with
  64 independent bindings; 16 arranged frames; 10 five-level lattices; eight
  groups with six levels of nesting; 16 spatial-noise-driven objects; eight
  objects with three triple-noise influences each; and 16 objects with four-layer
  noise influences (16 cases).

The boundary cases exercise individual supported ceilings. They are not a claim
that every independent maximum can be combined into one accepted document.
Existing Builder budgets already reject some such combinations. Additional
tests confirm switching Original/Selective does not alter these designs' shader
source or live-uniform definitions.

When an intentionally changed template/compiler requires different output, review
and version the compatibility fixtures explicitly. Do not regenerate the baseline
just to make a new limit pass. No supported original template is exempt from the
workload check.

All 86 cases pass with canonical artifacts unchanged. The largest estimated
per-fragment workload is 42,677,865 units (eight objects with three triple-noise
influences); the largest token count is 47,254 (Rose Circuit Builder). These fit
within the limits without per-template exceptions. Additional bounded-noise
combinations were checked: every one accepted by existing Builder budgets also
passed the new validator. This is corpus evidence, not a proof that every
possible legal Builder design fits.

The saved local snapshot's 15 existing template/Builder scenes also pass a
read-only compile/validation check. User scene contents are not committed to this
corpus. No template geometry, rendering profile, audio mode, scene record or
template content was changed to obtain acceptance.

## Reproduce the measurements

The frontend pins the fork's immutable `v1.0.4-mage.5` release asset and its
lockfile integrity. A fresh `npm ci` includes PL-03 without a local package
override. The original `.4` release remains available unchanged for rollback.
After installing dependencies, run:

```text
node scripts/report-shader-workload.mjs
```

This runs the corpus test and writes `docs/pl03-workload.v1.report.json`.
Use `--output <path>` for an uncommitted report. It compiles only checked-in,
bounded reference designs. No canvas, audio analyser, GPU context or scene data
is created or modified. Untrusted amplified artifacts must be checked as data;
never render them as a way to test the limit.

Timings are measurements of validation on the reporting machine, not guaranteed
device performance. They are reported rather than asserted as flaky wall-clock
unit-test limits. The recorded Windows x64/Node run uses seven samples per case
after warm-up: per-case medians range from 0.31 to 11.56 ms, with the largest
per-case p95 21.13 ms. This measures a complete normalization/validation call, not
only the additional graph calculation, and does not claim mobile measurements.

An optional read-only saved-scene check accepts `PL03_SAVED_SCENES` (a local JSON
array containing `sceneId` and `sceneData`) and writes diagnostics only when
`PL03_SAVED_REPORT` is set. It refuses custom source because executing that source
requires the disposable worker boundary. Keep user snapshots and reports outside
version control.

## Local review validation (2026-10-16)

- Frontend: 3,197 tests passed; the optional saved-scene test was separately run
  against all 15 local scenes. Lint and both application/isolated-renderer builds
  passed.
- Tooling: 71 Node tests and 89 tooling Vitest tests passed, including isolated
  bundle boundaries, artifact rejection, protocol transport and type checks.
- Engine: 41 tests and 180 generated-shader parse checks passed.
- Fresh local servers passed renderer asset/header/route verification. All 14
  catalog templates loaded individually in the editor. Original and Selective
  both displayed measured track inputs and simulated-beat responses while the
  preview continued rendering.
- One rapid-switch sequence reached the existing playback-timeout screen. Retry
  recovered it, and subsequent individual template loads passed without workload
  rejection. The cause of that intermittent timeout is not established. Inspection
  confirmed PL-03 changes neither watchdog timing nor per-frame audio/render work.

The checks above were completed on `codex/pl03-shader-workload` before integration.
The user subsequently authorized committing and merging, with deployment deferred.
The versioned engine dependency supports reproducible installs; it does not update
the live website or isolated renderer.
