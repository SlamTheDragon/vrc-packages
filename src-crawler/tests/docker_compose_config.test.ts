import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const composePath = join(root, "docker-compose.yml");
const envExamplePath = join(root, ".env.example");

test("docker-compose.yml exists and has valid configuration structure", () => {
  expect(existsSync(composePath)).toBe(true);
  const content = readFileSync(composePath, "utf8");

  // Must declare services and crawler-node
  expect(content).toMatch(/services:\s*\n\s+crawler-node:/);

  // Must require pinned VRCP_NODE_IMAGE
  expect(content).toContain("${VRCP_NODE_IMAGE:?");

  // Must require NODE_TOKEN
  expect(content).toContain("${NODE_TOKEN:?");

  // Must provide COORDINATOR_URL fallback
  expect(content).toContain("COORDINATOR_URL=");

  // Must provide NODE_ID fallback
  expect(content).toContain("NODE_ID=");

  // Must provide NODE_CAPABILITIES fallback
  expect(content).toContain("NODE_CAPABILITIES=");

  // Must mount /app/data volume for SQLite and logs
  expect(content).toMatch(/- \.\/data:\/app\/data/);

  // Must enforce at least 30s stop grace period for graceful shutdown
  expect(content).toMatch(/stop_grace_period:\s*30s/);
});

test("docker-compose.yml strictly excludes unverified auto-updaters and host socket mounts", () => {
  const content = readFileSync(composePath, "utf8");

  // No watchtower service or image
  expect(content.toLowerCase()).not.toContain("containrrr/watchtower");
  expect(content).not.toMatch(/container_name:\s*vrcp-node-watchtower/);
  expect(content).not.toContain("com.centurylinklabs.watchtower");

  // No host Docker socket access
  expect(content).not.toContain("/var/run/docker.sock");
});

test("src-crawler/.env.example provides complete template for node configuration", () => {
  expect(existsSync(envExamplePath)).toBe(true);
  const content = readFileSync(envExamplePath, "utf8");

  // Must document all necessary configuration keys
  expect(content).toContain("NODE_TOKEN=");
  expect(content).toContain("VRCP_NODE_IMAGE=");
  expect(content).toContain("NODE_ID=");
  expect(content).toContain("COORDINATOR_URL=");
  expect(content).toContain("NODE_CAPABILITIES=");

  // Must not be empty or placeholder-only
  expect(content.length).toBeGreaterThan(200);
});
