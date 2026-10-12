# Active R49-C29 — distributed pagination conformance (2026-10-13)

- Branch: `preview/crawler-network`. Prior ledger audit: `c11bd61`; public catalog error hardening: `76a1949`.
- Owner explicitly allows batched pushes for preview publication and dependency synchronization. Unrelated commits stay local. No production publication or SDK v0.1.0 is authorized.
- Theory confirmed: duplicated encoders treated Unicode as Latin-1; 256-character tokens could not carry accepted 500-character IDs. Search/moderator/operator contracts also diverged.
- SDK producer implemented: shared UTF-8 codec, stable ASCII bytes, explicit `u1_` Unicode marker, strict canonical decoding, 8192-character token bound, 128-character affected ISO timestamps, 500-character moderator canonical IDs.
- Negative checks cover oversized payloads, invalid UTF-8, unknown versions, padding, duplicate JSON keys, member order, extra fields, ambiguous old Latin-1 and invalid route payloads. Old non-ASCII tokens require pagination restart.
- SDK checkpoint: `bun run test` and `bun run typecheck` passed. Final suite: 74 tests, 1072 assertions, eight files.
- Packed distribution check passed offline: isolated Node and no-type-stripping Node, type consumer, Wrangler bundle, native workerd. 35 files; zero external runtime fetches. Long Unicode IDs cross HTTP serialization.
- Checkpoint failures were compiler import/fixture mistakes, then stale taxonomy-export and synthetic search-token assertions. Corrected fixtures match current delivered rating and cursor contracts; assertions were not removed.
- Remaining chain: publish preview SDK through root executor; verify registry/CI bytes; publish network archive because its exact SDK peer bound changes; adopt distributed dependencies in Worker/crawler; remove Worker cursor copies; run Worker protocol/type/runtime checks and verify pagination behavior.
- Network currently accepts SDK `0.0.8 || 2026.10.10-pre`. Root synchronization owns generated manifest/config changes; never edit version JSON directly.
- Main delivery sign-off stays accepted. Website/desktop responsibilities and release SDK remain unchanged.
- Deferred risks remain in canonical/unmerged ledgers: fleet budgets/distributed throttling, source/publication rights, ownership/age evidence, API v0.1 owner review, changelog crash recovery, and 98 documentation-link findings. No source access grant or live crawl follows from this slice.
