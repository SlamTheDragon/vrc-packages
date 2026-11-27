---
name: ste-recurring-errors
description: >-
  Audit, detect, and resolve the 39 most common ASD-STE100 Issue 9 recurring writer errors and unapproved vocabulary substitutions in technical documentation and prose. Use when reviewing drafts, rules, legal summaries, or changelog notes for strict vocabulary compliance.
metadata:
  spec: ASD-STE100 Issue 9 (January 2025)
---

# ste-recurring-errors

Audit and resolve the 39 most recurring writer errors defined in ASD-STE100 Issue 9. These words are unapproved terms writers reach for on autopilot. Use this skill to identify unapproved words and substitute approved replacements.

This skill applies to documentation, READMEs, pull requests, release notes, comments, tool descriptions, and agent communications. It does not apply to code identifiers, package names, or command syntax.

## Procedural Steps

1. **Scan target text**: Check the draft against the 39 recurring errors table below. Pay close attention to `ensure`, `however`, `since`, `may`, `should`, `perform`, and `using`.
2. **Adjust sentence structure for part-of-speech changes**: Replace verb `check` with noun `check` ("do a check"), verb `damage` with noun `damage`, and `have to` with an imperative verb.
3. **Verify with the linter**:
   ```powershell
   python .agents/skills/ste-writing-skill/ste-lint.py --strict <file-path>
   ```
   Target under 1.5 violations per 100 words in strict mode.

## Guards

- Preserve all facts, quantities, route paths, schema names, code identifiers, and legal meaning.
- Treat `may` (permission) and `should` (recommendation) vs `must` (obligation) carefully: semantic modality overrides mechanical substitution whenever replacing a modal verb would alter policy or legal meaning.
- Do not use em-dashes in prose. Use colons, parentheses, or periods instead.
- If input text already complies with ASD-STE100, leave it unchanged.

## The 39 Recurring Errors Table

Approved replacements are printed in UPPERCASE as in ASD-STE100 Issue 9 (source: https://asd-ste100.org).

| # | Do Not Write | Write |
| :---: | :--- | :--- |
| 1 | acceptable (adj) | PERMITTED |
| 2 | alternate (adj) | ALTERNATIVE |
| 3 | any (adj) | none, or a different sentence construction |
| 4 | avoid (v) | PREVENT |
| 5 | both (adj) | THE TWO |
| 6 | check (v) | CHECK (n): "do a check" |
| 7 | cover (v) | COVER (n) |
| 8 | complete (adj) | COMPLETED |
| 9 | damage (v) | DAMAGE (n) |
| 10 | ensure (v) | MAKE SURE |
| 11 | fit (v) | INSTALL |
| 12 | follow (v) | OBEY |
| 13 | further (adj) | MORE |
| 14 | further (adv) | MORE |
| 15 | have to (v) | an action verb in the imperative form |
| 16 | however (adv) | BUT |
| 17 | insert (v) | PUT |
| 18 | main (adj) | PRIMARY |
| 19 | may (v) | CAN |
| 20 | need (v) | NECESSARY (adj) |
| 21 | now (adv) | AT THIS TIME |
| 22 | old (adj) | REMAINING, USED, EXPIRED |
| 23 | over (prep) | ABOVE, ON, ALONG |
| 24 | people (n) | PERSON, PERSONNEL |
| 25 | perform (v) | DO |
| 26 | portion (n) | PART |
| 27 | press (v) | PUSH |
| 28 | reach (v) | GET |
| 29 | repeat (v) | DO ... AGAIN |
| 30 | required (v) | NECESSARY (adj) |
| 31 | rotate (v) | TURN |
| 32 | secure (v) | ATTACH, SAFETY |
| 33 | shall (v) | MUST |
| 34 | should (v) | MUST |
| 35 | since (conj) | BECAUSE |
| 36 | test (v) | TEST (n) |
| 37 | therefore (adv) | THUS, AS A RESULT |
| 38 | under (prep) | BELOW, IN, LESS THAN |
| 39 | using (v) | USE, WITH |

## High-Frequency Software Doc Replacements

- **ensure -> make sure**: Most common violation in READMEs and rules.
- **however -> but** and **therefore -> thus / as a result**: Shorter connectors with the same logic.
- **since -> because**: `since` is permitted only for time, never for cause.
- **may -> can** and **should / shall -> must**: Use `can` for permission/ability and `must` for obligation.
- **perform -> do**: Replace nominalizations ("perform an analysis" -> "analyze" or "do an analysis").
- **using -> use / with**: "Using the CLI, run..." -> "Run ... with the CLI."
- **check / test as verbs**: Prefer noun phrases ("do a check", "do a test") or one consistent approved verb.

The `--strict` flag of `ste-lint.py` enforces the strict subset (`however`, `since`, `may`, `should`, `shall`, `using`, `follow`).
