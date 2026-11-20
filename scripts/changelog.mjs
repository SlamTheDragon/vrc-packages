import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const root = fileURLToPath(new URL("../", import.meta.url));

export const changelogFolders = {
  crawler: "vrcp-crawler-node",
  "crawler-client": "vrcp-crawler-client",
  package: "vrcp-packages-api",
  network: "vrcp-packages-network",
  worker: "vrcp-worker",
  web: "vrcp-web",
};

export const changelogIdentifiers = {
  release: { ...changelogFolders },
  preview: {
    crawler: "vrcp-crawler-node-preview",
    "crawler-client": "vrcp-crawler-client-preview",
    package: "vrcp-packages-api-preview",
    network: "vrcp-packages-network",
    worker: "vrcp-worker-preview",
    web: "vrcp-web-preview-preview",
  },
};

export function stripMarkdownComments(text) {
  if (!text) return "";
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Find the start and end of a product's changelog section in CHANGELOG.md
 * using strictly typed channel and product identifiers.
 */
export function findProductChangelogSection(markdown, channel, product) {
  const identifier = changelogIdentifiers[channel]?.[product];
  if (!identifier) return null;
  const folder = changelogFolders[product] ?? product;
  const lines = markdown.replace(/\r/g, "").split("\n");
  const targetTag = `\`${identifier}\``;

  const matches = lines.flatMap((line, index) => line.startsWith("## ") &&
    (line.includes(targetTag) || line === `## ${identifier}`) ? [index] : []);
  if (matches.length > 1) throw new Error("Duplicate product/channel changelog sections");
  const start = matches[0] ?? -1;
  if (start < 0) return null;

  let end = lines.findIndex((l, i) => i > start && (l.startsWith("## ") || l.startsWith("# ") || l === "---"));
  if (end < 0) end = lines.length;

  const rawSection = lines.slice(start + 1, end).join("\n");
  const section = stripMarkdownComments(rawSection);
  return { start, end, heading: lines[start], folder, identifier, section: section || "- none currently" };
}

/**
 * Snapshot source notes, archive the selected product/channel and preserve its empty skeleton.
 * (or docs/changelogs/<folder>/<version>.md for single-stream products like network).
 */
export function extractProductChangelog(channel, product, version, workspace = root, dryRun = false) {
  if (!changelogIdentifiers[channel]?.[product] || semver.valid(version) !== version) {
    throw new Error("Invalid changelog product, channel or version");
  }
  const folder = changelogFolders[product] ?? product;
  const sourcePath = resolve(workspace, "docs/source/CHANGELOG.md");
  const changelogPath = existsSync(sourcePath) ? sourcePath : resolve(workspace, "CHANGELOG.md");
  if (!existsSync(changelogPath)) return null;
  const markdown = readFileSync(changelogPath, "utf8");
  const found = findProductChangelogSection(markdown, channel, product);
  if (!found) {
    if (changelogPath === sourcePath) throw new Error("Missing selected product/channel in source changelog");
    return null;
  }

  const targetDir = product === "network"
    ? resolve(workspace, "docs/changelogs", folder)
    : resolve(workspace, "docs/changelogs", folder, channel);
  const targetFile = resolve(targetDir, `${version}.md`);

  const content = `# ${folder} ${version}\n\nChannel: ${channel}.\n\n${found.section}\n`;
  if (existsSync(targetFile) && readFileSync(targetFile, "utf8") !== content) {
    throw new Error("Existing version changelog differs; inspect the pending publication before retrying");
  }
  if (dryRun) return { file: targetFile, section: found.section };
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(targetFile, content);

  const changed = [targetFile];
  if (changelogPath === sourcePath) {
    // Preserve the full publication snapshot before consuming only its selected notes.
    const snapshotPath = resolve(workspace, "CHANGELOG.md");
    writeFileSync(snapshotPath, markdown);
    const lines = markdown.replace(/\r/g, "").split("\n");
    const section = lines.slice(found.start + 1, found.end).join("\n");
    const skeleton = section.match(/<!--[\s\S]*?-->|^#{3,6} .*?$|^See full history at .*?$/gm) ?? [];
    lines.splice(found.start + 1, found.end - found.start - 1, "", ...skeleton, "");
    writeFileSync(sourcePath, lines.join(markdown.includes("\r\n") ? "\r\n" : "\n"));
    changed.push(snapshotPath, sourcePath);
  }

  return { file: targetFile, section: found.section, changed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, channel, product, version] = process.argv.slice(2);
  try {
    if (action === "extract" && channel && product && version) {
      const result = extractProductChangelog(channel, product, version);
      console.log(JSON.stringify({ extracted: true, file: result?.file }));
    } else {
      throw new Error("Usage: node scripts/changelog.mjs extract <channel> <product> <version>");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Changelog extraction failed");
    process.exitCode = 1;
  }
}
