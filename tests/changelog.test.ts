import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { extractProductChangelog, findProductChangelogSection, stripMarkdownComments } from "../scripts/changelog.mjs";

test("duplicate sections fail closed instead of consuming an ambiguous target", () => {
  expect(() => findProductChangelogSection("## vrcp-worker-preview\n- first\n## vrcp-worker-preview\n- second\n", "preview", "worker"))
    .toThrow("Duplicate product/channel");
});

test("publication snapshots source, consumes only selected notes and preserves its skeleton", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-changelog-test-"));
  try {
    mkdirSync(join(dir, "docs/source"), { recursive: true });
    const source = "# Preview\n## `vrcp-crawler-node-preview`\n<!-- summary -->\nPending summary\n<!-- summary -->\n### Added\n- New node behavior\n### Bugs Fixed\n- Fixed retry\n### Changes\n- Changed interval\nSee full history at [history](../changelogs/node)\n## `vrcp-worker-preview`\n### Added\n- Keep worker notes\n# Release\n## `vrcp-crawler-node`\n- Keep release notes\n";
    writeFileSync(join(dir, "docs/source/CHANGELOG.md"), source);
    writeFileSync(join(dir, "CHANGELOG.md"), "old snapshot");
    extractProductChangelog("preview", "crawler", "2026.10.1-pre", dir, true);
    expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8")).toBe("old snapshot");
    const result = extractProductChangelog("preview", "crawler", "2026.10.1-pre", dir)!;
    expect(result.changed).toHaveLength(3);
    expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8")).toBe(source);
    const remaining = readFileSync(join(dir, "docs/source/CHANGELOG.md"), "utf8");
    expect(remaining).not.toContain("Pending summary");
    expect(remaining).not.toContain("New node behavior");
    expect(remaining).toContain("### Added\n### Bugs Fixed\n### Changes");
    expect(remaining).toContain("<!-- summary -->\n<!-- summary -->");
    expect(remaining.slice(remaining.indexOf("## `vrcp-worker-preview`"))).toBe(source.slice(source.indexOf("## `vrcp-worker-preview`")));
    expect(() => extractProductChangelog("preview", "crawler", "2026.10.1-pre", dir)).toThrow("Existing version changelog differs");
    expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8")).toBe(source);
    expect(() => extractProductChangelog("preview", "package", "2026.10.1-pre", dir)).toThrow("Missing selected");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("extractProductChangelog copies product notes to dedicated markdown without modifying root CHANGELOG", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-changelog-test-"));
  try {
    const initialChangelog = `# Latest Changes

Here are the current changelogs of each product.

## vrcp-crawler-node

- Added high-performance stream logging.
- Fixed lease loss reconnection delay.

## vrcp-packages-api

- none currently
`;
    writeFileSync(join(dir, "CHANGELOG.md"), initialChangelog);

    const result = extractProductChangelog("release", "crawler", "0.0.9", dir);
    expect(result).toBeDefined();
    expect(result!.section).toContain("Added high-performance stream logging.");

    const perVersion = readFileSync(result!.file, "utf8");
    expect(perVersion).toContain("# vrcp-crawler-node 0.0.9");
    expect(perVersion).toContain("Channel: release.");
    expect(perVersion).toContain("Added high-performance stream logging.");
    expect(perVersion).toContain("Fixed lease loss reconnection delay.");

    const updatedRoot = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    expect(updatedRoot).toBe(initialChangelog);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("extractProductChangelog handles network single stream layout", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-changelog-test-"));
  try {
    const initialChangelog = `# Latest Changes

## vrcp-packages-network

- Sync network peer bounds.
`;
    writeFileSync(join(dir, "CHANGELOG.md"), initialChangelog);

    const result = extractProductChangelog("preview", "network", "2026.10.6", dir);
    expect(result).toBeDefined();
    expect(normalize(result!.file)).toContain(normalize("docs/changelogs/vrcp-packages-network/2026.10.6.md"));

    const perVersion = readFileSync(result!.file, "utf8");
    expect(perVersion).toContain("Sync network peer bounds.");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("extractProductChangelog distinguishes release and preview headings with backtick identifiers", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-changelog-test-"));
  try {
    const changelogWithSections = `# Changelog

# Applications - Release

## VRC Packages Crawler - \`vrcp-crawler-node\`

### Added

- Release crawler feature.

# Applications - Preview

## VRC Packages Crawler - \`vrcp-crawler-node-preview\`

### Added

- Preview crawler experiment.

---
`;
    writeFileSync(join(dir, "CHANGELOG.md"), changelogWithSections);

    const relResult = extractProductChangelog("release", "crawler", "0.0.9", dir);
    expect(relResult).toBeDefined();
    expect(relResult!.section).toContain("Release crawler feature.");
    expect(relResult!.section).not.toContain("Preview crawler experiment.");

    const prevResult = extractProductChangelog("preview", "crawler", "2026.10.8-pre", dir);
    expect(prevResult).toBeDefined();
    expect(prevResult!.section).toContain("Preview crawler experiment.");
    expect(prevResult!.section).not.toContain("Release crawler feature.");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("stripMarkdownComments removes HTML/markdown comments and normalizes whitespace", () => {
  const input = `<!-- header comment -->
Some text here <!-- inline comment --> and more text.
<!--
multi-line
comment
-->
### Section

<!-- trailing comment -->`;

  const stripped = stripMarkdownComments(input);
  expect(stripped).not.toContain("header comment");
  expect(stripped).not.toContain("inline comment");
  expect(stripped).not.toContain("multi-line");
  expect(stripped).not.toContain("trailing comment");
  expect(stripped).toContain("Some text here  and more text.");
  expect(stripped).toContain("### Section");
});

test("extractProductChangelog strips markdown comments from extracted markdown file", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-changelog-test-"));
  try {
    const changelog = `# Changelog

## VRC Packages Crawler - \`vrcp-crawler-node\`

<!-- vrcp-crawler-node-DESCRIPTION_SUMMARY -->
Crawler Node release v0.0.11 summary text.
<!-- vrcp-crawler-node-DESCRIPTION_SUMMARY -->

### Added

<!-- developer note -->
- Added comment stripping feature.

### Changed

- Updated parser.
`;
    writeFileSync(join(dir, "CHANGELOG.md"), changelog);

    const result = extractProductChangelog("release", "crawler", "0.0.11", dir);
    expect(result).toBeDefined();
    expect(result!.section).not.toContain("DESCRIPTION_SUMMARY");
    expect(result!.section).not.toContain("developer note");
    expect(result!.section).toContain("Crawler Node release v0.0.11 summary text.");
    expect(result!.section).toContain("Added comment stripping feature.");

    const perVersion = readFileSync(result!.file, "utf8");
    expect(perVersion).not.toContain("<!--");
    expect(perVersion).not.toContain("-->");
    expect(perVersion).toContain("Crawler Node release v0.0.11 summary text.");
    expect(perVersion).toContain("Added comment stripping feature.");

    // Root CHANGELOG.md remains untouched with comments preserved
    const rootAfter = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    expect(rootAfter).toBe(changelog);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

