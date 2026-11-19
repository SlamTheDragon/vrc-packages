---
name: system-reliability-review
description: Performs a cross-sector reliability, boundary, and code-path audit before claiming a capability gate or release milestone is complete.
---

# System Reliability Review Procedure

1. **Enumerate sector trust boundaries and callers**:
   - Identify every externally observable operation, wire boundary, and legal/documentation boundary touched by the gate using live source references (`docs/source/SYSTEM_MAP.md`).
   - Trace each path end to end: entry point -> policy/lease/validation -> storage/projection -> downstream consumer.
2. **Challenge the change with the applicable sector failure matrix**:
   - **Sector 1 (`crawler-network`)**: malformed payload, absent or revoked source profile, RFC 9309 robots denial or staleness, redirect/SSRF, timeout, partial parse, duplicate result, expired/lost lease, coordinator outage (fail closed), SQLite outbox crash/restart, multi-node origin race, and binary download rejection.
   - **Sector 2 (`desktop-client`)**: failed node install/supervision, unresponsive coordinator, stale SDK DTOs, `shadcn-svelte` / Rule 09 UI regressions, Tauri IPC errors.
   - **Sector 3 (`api-web`)**: strict snake-case DTO violations, cursor bounds/encoding drift, missing permissions, unauthenticated vs authenticated route leaks, Astro/Svelte hydration errors.
   - **Sector 4 (`pipeline`)**: dirty tree handling, missing predecessor release proof, partial publication rollback, frozen-tag rerun misuse, changelog consumption/snapshot corruption.
   - **Sector 5 (`legal-research`)**: unverified statutory/platform citations, research prose leaking into `docs/source/` as current behavior, unapproved platform clearance assumptions, broken relative links.
   - Add a minimal regression test for every changed runtime boundary; mark genuinely inapplicable rows with an explicit reason.
3. **Verify cross-project isolation and artifacts**:
   - Confirm zero relative sibling imports, aliases, or `file:../src-*` links across `src-*` projects.
   - Compare in-process simulation and loopback HTTP on identical versioned schemas, and verify compiled binaries / native `workerd` runtime where applicable.
4. **Verify provenance and publication boundaries separately**:
   - Confirm discovery leads cannot silently become canonical authority without approved provenance rules, and restricted `publishClasses` cannot leak into public catalog or delta streams.
5. **Run domain verification and link/style checks**:
   - Run the owning sector's verification commands from [`docs/source/SYSTEM_MAP.md`](../../../docs/source/SYSTEM_MAP.md) (run root `bun test ./tests` ONLY when Sector 4 root tooling changed).
   - Run `bun .agents/scripts/check_doc_links.ts` and `python .agents/skills/ste-writing-skill/ste-lint.py` on changed prose/changelogs.
6. **Report verifiable status**:
   - List confirmed strengths, failures, untested risks, and the smallest next slice. Never equate test counts or code volume with system reliability.
