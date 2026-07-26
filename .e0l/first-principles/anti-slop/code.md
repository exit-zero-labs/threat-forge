<!-- @format -->

# Code, test, and documentation tells

The catalogue for the machinery. Read [index.md](index.md) first — the two guardrails there govern every entry below, and the first one (**functionality is sacred**) matters most here, because the obvious way to reduce apparent slop in code is to delete things.

> Sources: Project Postcard `docs/research/agentic-slop.md`, whose dated changelog remains the evidence base. Each tell below was named because a real defect shipped past green CI.

Required reading before writing or reviewing code, tests, or documentation in any Exit Zero Labs repo. It is the source material for the `anti-slop-review` skill and the `slop-auditor` agent.

## Code

- **Over-engineering and speculative generality.** Factories, managers, options objects, and abstraction layers for a single call site or a problem that does not exist yet. Add abstraction when a second real caller exists, not before.
- **Redundant defensive code.** Null checks and `try`/`catch` guarding conditions that cannot occur or are already guaranteed by types and contracts; re-validating input the edge already parsed; catch blocks that swallow errors. Noise that drowns the real logic. Contrast with a genuine trust boundary, which is *necessary*.
- **Comment slop.** Comments restating the code (`// increment i`), echoing the function name, narrating the obvious, or hedging (`// In a real implementation…`, `// This should probably…`). Comment the non-obvious *why*, never the *what*.
- **Hallucinated or misused APIs.** Methods, options, or libraries that do not exist or do not behave as written. Verify the API, do not assume it.
- **Duplication instead of reuse.** Near-identical functions, types, or blocks generated in isolation instead of sharing a helper or a shared contract type. Cross-surface types live in one place.
- **Inconsistency with existing patterns.** Each file reinventing error handling, naming, structure, or the response envelope. **Read the neighbours before writing.**
- **Fake or stub implementations dressed as done.** `return true // TODO`, hardcoded sample data pretending to be a real fetch, a function whose body does not do what its name promises. A stub is fine when *labelled* a stub; slop is a stub that looks finished.
- **Dead code and leftover scaffolding.** Unused exports, variables, parameters, files, commented-out blocks.
- **Tooling under a file-routed directory.** In file-routed frameworks, a colocated helper or test is not merely organisation — it can become a production endpoint and pull the test runner into the server bundle. Keep only intended route files under the routed root, and assert the route tree contains no tooling modules.
- **Magic values.** Hardcoded numbers, strings, and thresholds that belong in a named constant, contract, or config.
- **Confident-but-wrong logic.** Code that compiles, reads plausibly, and passes shallow tests but does not do the right thing. **The highest-cost tell, and the one only validation catches.**
- **Type-escape casts.** `as any`, `as never`, `as unknown as T`, or a non-null assertion used to silence the type checker instead of modelling the type. An agent reaching for one is usually hiding a real typing gap.

## Tests

Tests are where slop hides most dangerously, because green is mistaken for correct.

- **Tests that do not test.** Happy path only; asserting on the example the code was written against; `expect(true).toBe(true)`; asserting a value the test computed the same way the code did.
- **Tautological tests.** The test restates the implementation, so it passes for any implementation shaped like this one. It cannot fail when the code is wrong.
- **Reward hacking — weakened to pass.** Turning a failing test green by loosening the assertion, deleting the case, hardcoding the expected output, or matching the code's current and possibly wrong behaviour. **If a test fails, fix the code or fix the test's intent. Never lower the bar to get green.**
- **Testing the mock.** Assertions that only prove the mock was configured. Prefer a real database, worker, or renderer where feasible.
- **Snapshot-everything.** Giant snapshots nobody reads, blessed on every change, hiding regressions.

## Documentation

Internal documentation inherits the prose tells in [copy.md](copy.md), plus these:

- **Restating the code in prose.** Narrating what the code obviously does instead of the *why*, the trade-offs, and what the code cannot say.
- **Fabricated rationale or precision.** Invented benchmarks, made-up numbers, or a decision justified as "because it is better" with no real trade-off. ADRs and plans state the alternatives actually rejected and why.
- **Drift.** Documentation describing a past state of the code. **A document that has drifted is worse than no document**, because it is trusted.
- **Marketing tone in engineering documentation.** Direct, crafted, grounded. No preamble, no superlatives.
- **Live-plan drift after a review-driven change.** A review fix hardens the code — a new gate, a reordered check — while the plan still argues the old behaviour and its verification criterion still demands proof of it. Every gate stays green because no tool reads the plan, and the contradiction lands in exactly the document a validator reads to decide whether the diff did the right thing. Any change that alters behaviour a plan argues for updates the design section **and** the affected criterion, not only the re-plan log.

## What is not slop

The false-positive guard. Do not "fix" these — flagging them is the noise the second guardrail warns about.

- **Necessary defensive code** at a genuine trust boundary: untrusted input, an external API, a webhook, parsing.
- **Real edge-case handling** the spec or domain demands.
- **Thorough tests** covering error paths, edge values, and negative cases. That is rigour, not bloat.
- **Genuine domain complexity** that cannot be simplified without losing behaviour.
- **Comments explaining a non-obvious *why***, a workaround, a subtle invariant, or a link to a decision.
- **Deliberate, contract-backed abstraction** with more than one real caller.

## Reporting format

Findings are reported as:

```
path:line · category · why it is slop · the minimal behaviour-preserving fix
```

Every finding carries a fix that a human can confirm leaves behaviour unchanged. A finding without one is an opinion.

**Do not invent findings to look thorough.** Returning "clean" on a clean diff is the correct output, and manufacturing a finding to appear rigorous is itself the tell this document exists to catch.
