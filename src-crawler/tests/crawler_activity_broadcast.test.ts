import { describe, it, expect, afterAll } from "bun:test";
import { Logger } from "../src/utils/logging/logger.ts";
import path from "path";
import fs from "fs";

const outputPath = path.resolve(import.meta.dir, "../dist/tests");
fs.mkdirSync(outputPath, { recursive: true });
const tempRoot = fs.realpathSync(outputPath);

describe("R16-C19: Crawler Node Dedicated Activity and Finding Log Broadcast", () => {
  const testDir = fs.mkdtempSync(path.join(tempRoot, "test_activity_broadcast_"));
  let logger: Logger;

  afterAll(async () => {
    try { await logger?.close(); } catch (_) {}
    if (fs.existsSync(testDir)) {
      if (!fs.realpathSync(testDir).startsWith(tempRoot + path.sep)) throw new Error("Unexpected log fixture path");
      try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  it("broadcasts operational activities with [ACTIVITY] tag to latest.log", async () => {
    logger = new Logger({
      logsDir: testDir,
      sessionId: `test_activity_${process.pid}`,
      initialDate: "2026-10-16",
    });

    const activePath = logger.getActiveLogPath();
    expect(fs.existsSync(activePath)).toBe(false);

    logger.activity("Crawler node daemon started", { runId: "test-run-1", runOnce: true });
    logger.activity("Claimed vpm job job-123 for https://example.com/vpm.json", {
      jobId: "job-123",
      platform: "vpm",
      url: "https://example.com/vpm.json",
      leaseId: "lease-abc"
    });
    logger.activity("Outbox entry outbox-456 successfully delivered for job job-123");

    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(activePath)).toBe(true);
    const content = fs.readFileSync(activePath, "utf-8");

    expect(content).toContain("[ACTIVITY] Crawler node daemon started");
    expect(content).toContain('"runId":"test-run-1"');
    expect(content).toContain("[ACTIVITY] Claimed vpm job job-123 for https://example.com/vpm.json");
    expect(content).toContain('"platform":"vpm"');
    expect(content).toContain("[ACTIVITY] Outbox entry outbox-456 successfully delivered for job job-123");
  });

  it("broadcasts package discovery findings with [FINDING] tag to latest.log", async () => {
    const activePath = logger.getActiveLogPath();

    logger.finding("Observed package 'Avatar Tool' by 'AuthorX'", {
      jobId: "job-123",
      platform: "booth",
      sourceItemKey: "booth:12345",
      title: "Avatar Tool",
      author: "AuthorX",
      version: "1.2.0",
      price: 1500,
      currency: "JPY",
      outboundLinksCount: 2
    });

    logger.finding("Extracted 2 outbound leads from https://booth.pm/items/12345", {
      jobId: "job-123",
      outboundLinks: ["https://github.com/AuthorX/AvatarTool", "https://authorx.com"]
    });

    logger.finding("Discovered batch of 3 packages from https://vpm.example.com/index.json", {
      jobId: "job-batch",
      platform: "vpm",
      count: 3,
      items: [
        { key: "pkg.a", title: "Package A", version: "1.0.0" },
        { key: "pkg.b", title: "Package B", version: "2.1.0" },
        { key: "pkg.c", title: "Package C", version: undefined }
      ]
    });

    logger.finding("Discovered 1 discovery leads from https://authorx.com", {
      jobId: "job-lead",
      platform: "html",
      count: 1,
      leads: [{ kind: "storefront_product", url: "https://authorx.booth.pm/items/999" }]
    });

    logger.finding("Listing unchanged at https://example.com/item/1", { jobId: "job-unchanged", platform: "booth" });
    logger.finding("Listing delisted or unavailable at https://example.com/item/2", { jobId: "job-gone", platform: "booth" });

    await new Promise((r) => setTimeout(r, 50));
    const content = fs.readFileSync(activePath, "utf-8");

    expect(content).toContain("[FINDING] Observed package 'Avatar Tool' by 'AuthorX'");
    expect(content).toContain('"title":"Avatar Tool"');
    expect(content).toContain('"price":1500');
    expect(content).toContain("[FINDING] Extracted 2 outbound leads from https://booth.pm/items/12345");
    expect(content).toContain("https://github.com/AuthorX/AvatarTool");
    expect(content).toContain("[FINDING] Discovered batch of 3 packages from https://vpm.example.com/index.json");
    expect(content).toContain('"key":"pkg.a"');
    expect(content).toContain("[FINDING] Discovered 1 discovery leads from https://authorx.com");
    expect(content).toContain("[FINDING] Listing unchanged at https://example.com/item/1");
    expect(content).toContain("[FINDING] Listing delisted or unavailable at https://example.com/item/2");
  });
});
