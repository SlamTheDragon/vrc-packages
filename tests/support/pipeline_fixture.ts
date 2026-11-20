import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { networkArchiveURL, productDirectories } from "../../scripts/versioning.mjs";

export const DEFAULT_RELEASE_VERSIONS = {
  "release-crawler": "0.0.0",
  "release-crawler-client": "0.0.0",
  "release-package": "0.0.0",
  "release-web": "0.0.0",
  "release-worker": "0.0.0"
};

export const DEFAULT_PREVIEW_VERSIONS = {
  "preview-crawler": "2026.10.0-pre",
  "preview-crawler-client": "26.10.0-pre",
  "preview-package": "2026.10.0-pre",
  "preview-web": "0.0.0",
  "preview-worker": "2026.10.0-pre",
  "preview-network": "2026.10.0"
};

/** Build a clean temporary multi-product monorepo workspace and run `run(workspace, git)`. */
export async function withPipelineWorkspaceFixture(
  run: (workspace: string, git: (cwd: string, ...args: string[]) => string) => Promise<void>,
  options: { withGit?: boolean; releaseVersions?: Record<string, string>; previewVersions?: Record<string, string> } = {}
) {
  const { withGit = true, releaseVersions = DEFAULT_RELEASE_VERSIONS, previewVersions = DEFAULT_PREVIEW_VERSIONS } = options;
  const workspace = await mkdtemp(join(tmpdir(), "vrcp-delivery-"));
  const remote = await mkdtemp(join(tmpdir(), "vrcp-origin-"));
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "VRCP Fixture",
      GIT_AUTHOR_EMAIL: "vrcp-fixture@example.invalid",
      GIT_COMMITTER_NAME: "VRCP Fixture",
      GIT_COMMITTER_EMAIL: "vrcp-fixture@example.invalid",
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never"
    }
  }).trim();

  try {
    await writeFile(resolve(workspace, "config.versions.json"), JSON.stringify(releaseVersions, null, 2) + "\n");
    await writeFile(resolve(workspace, "config.preview.versions.json"), JSON.stringify(previewVersions, null, 2) + "\n");

    const archive = networkArchiveURL(previewVersions["preview-network"]);
    for (const [product, dir] of Object.entries(productDirectories)) {
      await mkdir(resolve(workspace, dir), { recursive: true });
      const manifest: Record<string, unknown> = {
        name: product === "network" ? "vrc-packages-network" : `vrcp-${product}`,
        version: product === "network" ? previewVersions["preview-network"] : releaseVersions[`release-${product}`] ?? "0.0.0",
        private: true
      };
      if (["crawler", "worker", "crawler-client", "web"].includes(product)) {
        manifest.dependencies = {
          "vrc-packages-api": "latest",
          ...(product === "crawler" || product === "worker" ? { "vrc-packages-network": archive } : {})
        };
      } else if (product === "network") {
        manifest.peerDependencies = { "vrc-packages-api": ">=0.0.0" };
        manifest.devDependencies = { "vrc-packages-api": "npm:vrc-packages-api-preview@latest" };
      }
      await writeFile(resolve(workspace, dir, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
    }

    await mkdir(resolve(workspace, "src-crawler-client/src-tauri"), { recursive: true });
    await writeFile(resolve(workspace, "src-crawler-client/src-tauri/Cargo.toml"), '[package]\nname = "vrcp-crawler-client"\nversion = "0.0.0"\n');
    await writeFile(resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json"), JSON.stringify({
      version: "../package.json",
      bundle: { windows: { wix: { version: "0.0.0" } } }
    }, null, 2) + "\n");

    if (withGit) {
      git(remote, "init", "--bare", "--initial-branch=main");
      git(workspace, "init", "--initial-branch=main");
      git(workspace, "remote", "add", "origin", "https://github.com/SlamTheDragon/vrc-packages.git");
      git(workspace, "config", `url.${remote}.insteadOf`, "https://github.com/SlamTheDragon/vrc-packages.git");
      git(workspace, "add", "--all");
      git(workspace, "commit", "-m", "Synthetic baseline");
      git(workspace, "push", "-u", "origin", "main");
    }

    await run(workspace, git);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(remote, { recursive: true, force: true });
  }
}

export function createReviewedPRMockAPI(options: {
  repository?: string;
  prNumber?: number;
  base: string;
  head: string;
  commit: string;
  product: string;
  version: string;
  preparedFiles: string[];
  workspace: string;
  git: (cwd: string, ...args: string[]) => string;
  actor?: string;
}) {
  const {
    repository = "SlamTheDragon/vrc-packages",
    prNumber = 7,
    base,
    head,
    commit,
    product,
    version,
    preparedFiles,
    workspace,
    git,
    actor = repository.split("/")[0]
  } = options;
  const prefix = `/repos/${repository}`;
  return async (path: string) => {
    if (path === `${prefix}/pulls/${prNumber}`) {
      return {
        number: prNumber,
        state: "closed",
        merged: true,
        draft: false,
        base: { ref: "main", repo: { full_name: repository } },
        head: { ref: `release/candidate/${product}/v${version}`, sha: head, repo: { full_name: repository } },
        merge_commit_sha: commit,
        commits: 1,
        merged_by: { login: actor, type: "User" },
        user: { login: actor, type: "User" },
        auto_merge: null,
        merged_at: "2026-10-05T00:05:00Z"
      };
    }
    if (path === `${prefix}/pulls/${prNumber}/commits?per_page=2`) {
      return [{ sha: head, parents: [{ sha: base }] }];
    }
    if (path === `${prefix}/commits/${head}`) {
      return {
        sha: head,
        parents: [{ sha: base }],
        commit: { message: git(workspace, "show", "-s", "--format=%B", head) },
        files: preparedFiles.map(filename => ({ filename, status: "modified" }))
      };
    }
    if (path === `${prefix}/commits/${commit}`) {
      return { sha: commit, parents: [{ sha: base }, { sha: head }] };
    }
    if (path === `${prefix}/compare/${commit}...main`) {
      return { status: "identical", base_commit: { sha: commit }, merge_base_commit: { sha: commit } };
    }
    if (path === `${prefix}/pulls/${prNumber}/reviews?per_page=100`) {
      return [{ id: 1, state: "APPROVED", submitted_at: "2026-10-05T00:04:00Z", user: { login: actor, type: "User" } }];
    }
    const contentMatch = /^\/repos\/[^/]+\/[^/]+\/contents\/([^?]+)\?ref=([a-f0-9]{40})$/.exec(path);
    if (contentMatch) {
      const content = Buffer.from(git(workspace, "show", `${contentMatch[2]}:${contentMatch[1]}`)).toString("base64");
      return { type: "file", path: contentMatch[1], encoding: "base64", content };
    }
    throw new Error(`Unexpected GitHub API mock path: ${path}`);
  };
}
