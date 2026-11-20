import { describe, expect, test } from "bun:test";
import { IssueNodeCredentialSchema } from "vrc-packages-api";
import {
  MAX_ROBOTS_BYTES,
  OriginRobotsSnapshotSchema,
  RobotsBodySchema,
  RobotsOriginSchema,
  RobotsStatusCodeSchema,
  robotsResultAllowsMissingFile
} from "../src/robots/robots_snapshot.ts";
import {
  NODE_API_JSON_SCHEMAS,
  NodeIdSchema,
  NodeRobotsClaimRequestSchema,
  NodeRobotsClaimResponseSchema,
  NodeRobotsResultRequestSchema,
  NodeRobotsResultResponseSchema
} from "../src/protocol/node_protocol.ts";
import { isIp, isPrivateOrReservedIp } from "../src/policy/ip_policy.ts";
import {
  ARCHIVE_BINARY_EXTENSIONS,
  boothItemIdentity,
  classifyOutboundLeadKind,
  githubApiRepositoryIdentity,
  githubRepositoryIdentity,
  hasArchiveBinaryExtension,
  isArchiveOrBinaryUrl,
  isBoothBrowseTarget,
  isBoothProductTarget,
  isCustomDomainProductTarget,
  isGumroadProductTarget,
  isItchProductTarget,
  isJinxxyProductTarget,
  isSellfyProductTarget,
  isShopifyProductSitemapTarget,
  isShopifyProductTarget,
  isStorefrontProductTarget,
  normalizeGitHubApiUrl,
  normalizeGitHubRepositoryUrl,
  parseGitHubOwnerRepo,
  resolveDiscoveryLeadTarget,
  sellfyProductIdentity,
  shopifyProductLead
} from "../src/policy/source_targets.ts";

describe("vrc-packages-network unit contracts", () => {
  test("preserves NodeIdSchema reference equality with vrc-packages-api", () => {
    expect(NodeIdSchema).toBe(IssueNodeCredentialSchema.shape.nodeId);
  });

  test("aligns /v1/node/robots/* schemas with OriginRobotsSnapshotSchema", () => {
    const leaseId = crypto.randomUUID();

    expect(NodeRobotsClaimRequestSchema.parse({ schemaVersion: 1, nodeId: "node-1" })).toEqual({
      schemaVersion: 1,
      nodeId: "node-1"
    });
    expect(NodeRobotsClaimRequestSchema.safeParse({ schemaVersion: 1, nodeId: ".." }).success).toBe(false);
    expect(NodeRobotsClaimRequestSchema.safeParse({ schemaVersion: 1, nodeId: "node-1", extra: true }).success).toBe(false);

    expect(NodeRobotsClaimResponseSchema.parse({ schemaVersion: 1, status: "empty", retryAfterMs: 60000 })).toEqual({
      schemaVersion: 1,
      status: "empty",
      retryAfterMs: 60000
    });
    expect(NodeRobotsClaimResponseSchema.parse({
      schemaVersion: 1,
      status: "leased",
      origin: "https://example.org",
      leaseId
    })).toEqual({
      schemaVersion: 1,
      status: "leased",
      origin: "https://example.org",
      leaseId
    });
    expect(NodeRobotsClaimResponseSchema.safeParse({ schemaVersion: 1, status: "empty" }).success).toBe(false);
    expect(NodeRobotsClaimResponseSchema.safeParse({
      schemaVersion: 1,
      status: "leased",
      origin: "http://example.org",
      leaseId
    }).success).toBe(false);

    const parsedResult = NodeRobotsResultRequestSchema.parse({
      schemaVersion: 1,
      nodeId: "node-1",
      origin: "https://example.org",
      leaseId,
      statusCode: 404
    });
    expect(parsedResult.body).toBe("");
    expect(robotsResultAllowsMissingFile(parsedResult.statusCode)).toBe(true);

    expect(NodeRobotsResultRequestSchema.safeParse({
      schemaVersion: 1,
      nodeId: "node-1",
      origin: "http://example.org",
      leaseId,
      statusCode: 200,
      body: ""
    }).success).toBe(false);
    expect(NodeRobotsResultRequestSchema.safeParse({
      schemaVersion: 1,
      nodeId: "node-1",
      origin: "https://example.org/",
      leaseId,
      statusCode: 200,
      body: ""
    }).success).toBe(false);
    expect(NodeRobotsResultRequestSchema.safeParse({
      schemaVersion: 1,
      nodeId: "node-1",
      origin: "https://user:pass@example.org",
      leaseId,
      statusCode: 200,
      body: ""
    }).success).toBe(false);
    expect(NodeRobotsResultRequestSchema.safeParse({
      schemaVersion: 1,
      nodeId: "node-1",
      origin: "https://example.org",
      leaseId,
      statusCode: 100,
      body: ""
    }).success).toBe(false);

    const multiByteOverflow = "\u3042".repeat(200_000);
    expect(multiByteOverflow.length).toBeLessThan(MAX_ROBOTS_BYTES);
    expect(new TextEncoder().encode(multiByteOverflow).byteLength).toBeGreaterThan(MAX_ROBOTS_BYTES);
    expect(NodeRobotsResultRequestSchema.safeParse({
      schemaVersion: 1,
      nodeId: "node-1",
      origin: "https://example.org",
      leaseId,
      statusCode: 200,
      body: multiByteOverflow
    }).success).toBe(false);
    expect(OriginRobotsSnapshotSchema.safeParse({
      origin: "https://example.org",
      statusCode: 200,
      body: multiByteOverflow
    }).success).toBe(false);

    expect(RobotsOriginSchema.safeParse("https://example.org").success).toBe(true);
    expect(RobotsStatusCodeSchema.safeParse(200).success).toBe(true);
    expect(RobotsBodySchema.safeParse("User-agent: *\nAllow: /").success).toBe(true);
    expect(NodeRobotsResultResponseSchema.parse({
      schemaVersion: 1,
      status: "accepted",
      origin: "https://example.org"
    }).status).toBe("accepted");
    expect(NODE_API_JSON_SCHEMAS.robotsClaimRequest.type).toBe("object");
    expect(NODE_API_JSON_SCHEMAS.robotsResultRequest.type).toBe("object");
  });

  test("validates IP literals and private/reserved SSRF blocks consistently", () => {
    for (const validIp of ["127.0.0.1", "8.8.8.8", "::1", "[::1]", "2606:4700:4700::1111", "::ffff:127.0.0.1"]) {
      expect(isIp(validIp)).toBe(true);
    }
    for (const nonIp of ["", "localhost", "example.org", "example.org:443", "999.0.0.1", "[127.0.0.1]", "1:2:3:4:5:6:7:zzzz", "1::2::3"]) {
      expect(isIp(nonIp)).toBe(false);
    }
    for (const privateIp of ["", "localhost", "127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "::1", "[::1]", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "1:2:3:4:5:6:7:1z"]) {
      expect(isPrivateOrReservedIp(privateIp)).toBe(true);
    }
    for (const publicIp of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateOrReservedIp(publicIp)).toBe(false);
    }
  });

  test("blocks binary and archive extensions across paths and URLs", () => {
    for (const ext of [".zip", ".unitypackage", ".vpmz", ".tar.gz", ".fbx", ".obj", ".blend", ".prefab", ".asset", ".exe", ".7z"]) {
      expect(ARCHIVE_BINARY_EXTENSIONS).toContain(ext);
      expect(hasArchiveBinaryExtension(`/downloads/sample${ext}`)).toBe(true);
      expect(isArchiveOrBinaryUrl(`https://example.org/downloads/SAMPLE${ext.toUpperCase()}?dl=1`)).toBe(true);
    }
    expect(isArchiveOrBinaryUrl("https://example.org/index.json")).toBe(false);
    expect(isArchiveOrBinaryUrl("https://booth.pm/ja/items/12345")).toBe(false);
  });

  test("normalizes GitHub repository URLs and rejects reserved or malformed paths", () => {
    expect(parseGitHubOwnerRepo("vrc-get", "vrc-get")).toBe("vrc-get/vrc-get");
    expect(parseGitHubOwnerRepo("..", "internal")).toBeNull();
    expect(githubApiRepositoryIdentity("https://api.github.com/repos/vrc-get/vrc-get")).toBe("vrc-get/vrc-get");
    expect(githubRepositoryIdentity("https://github.com/vrc-get/vrc-get.git")).toBe("vrc-get/vrc-get");
    expect(githubRepositoryIdentity("https://github.com/vrc-get/vrc-get/releases/tag/v1.0.0")).toBe("vrc-get/vrc-get");
    expect(githubRepositoryIdentity("https://github.com/vrc-get/vrc-get/releases/download/v1.0.0/pkg.zip")).toBeNull();
    expect(githubRepositoryIdentity("https://github.com/topics/vrchat")).toBeNull();
    expect(githubRepositoryIdentity("https://github.com/vrc-get")).toBeNull();
    expect(normalizeGitHubRepositoryUrl("https://api.github.com/repos/vrc-get/vrc-get")).toBe("https://github.com/vrc-get/vrc-get");
    expect(normalizeGitHubApiUrl("https://github.com/vrc-get/vrc-get.git")).toBe("https://api.github.com/repos/vrc-get/vrc-get");
  });

  test("recognizes storefront targets, classifies leads, and maps approved discovery leads", () => {
    expect(isBoothBrowseTarget("https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB?page=1")).toBe(true);
    expect(boothItemIdentity("https://booth.pm/items/123")).toBe("123");
    expect(isBoothProductTarget("https://booth.pm/ja/items/456789")).toBe(true);
    expect(isGumroadProductTarget("https://gumroad.com/l/awesome-avatar")).toBe(true);
    expect(isJinxxyProductTarget("https://jinxxy.com/coolcreator/particle-gimmick")).toBe(true);
    expect(isItchProductTarget("https://creator.itch.io/vrchat-shader-pack")).toBe(true);
    expect(isItchProductTarget("https://itch.io/search?q=vrchat")).toBe(false);
    expect(isShopifyProductSitemapTarget("https://merchant.example/sitemap_products_1.xml?from=1&to=100")).toBe(true);
    expect(shopifyProductLead("https://merchant.example/products/vrchat-tool", "https://merchant.example")).toBe("https://merchant.example/products/vrchat-tool");
    expect(isShopifyProductTarget("https://jellycube.co/products/rurune-vrcft-add-on")).toBe(true);
    expect(isSellfyProductTarget("https://sellfy.com/creator/p/super-gimmick/")).toBe(true);
    expect(sellfyProductIdentity("https://sellfy.com/creator/p/super-gimmick/")).toBe("sellfy.com:creator:super-gimmick");
    expect(isCustomDomainProductTarget("https://store.vrcfury.com/tools/vrcfury")).toBe(true);
    expect(isCustomDomainProductTarget("https://store.vrcfury.com/")).toBe(false);
    expect(isStorefrontProductTarget("itch", "https://creator.itch.io/shader-pack")).toBe(true);
    expect(isStorefrontProductTarget("custom_domain", "https://payhip.com/b/sample-vrc-item")).toBe(true);

    expect(classifyOutboundLeadKind("https://github.com/vrcfury/vrcfury")).toBe("github_repository");
    expect(classifyOutboundLeadKind("https://github.com/topics/vrchat")).toBeNull();
    expect(classifyOutboundLeadKind("https://github.com/vrcfury/vrcfury/releases/download/v1/pkg.zip")).toBeNull();
    expect(classifyOutboundLeadKind("https://creator.itch.io/shader-pack")).toBe("storefront_product");
    expect(classifyOutboundLeadKind("https://payhip.com/b/sample-vrc-item")).toBe("storefront_product");
    expect(classifyOutboundLeadKind("https://ko-fi.com/s/sample-vrc-item")).toBe("storefront_product");
    expect(classifyOutboundLeadKind("https://store.vrcfury.com/tools/vrcfury")).toBe("publisher_site");
    expect(classifyOutboundLeadKind("https://127.0.0.1/internal")).toBeNull();
    expect(classifyOutboundLeadKind("https://itch.io/search?q=vrchat")).toBeNull();

    expect(resolveDiscoveryLeadTarget("vpm_listing", "https://vpm.example.org/index.json")).toEqual({
      platform: "vpm",
      purpose: "discovery",
      url: "https://vpm.example.org/index.json",
      minDelayMs: 1000
    });
    expect(resolveDiscoveryLeadTarget("github_repository", "https://github.com/vrcfury/vrcfury.git")).toEqual({
      platform: "github",
      purpose: "metadata",
      url: "https://api.github.com/repos/vrcfury/vrcfury",
      minDelayMs: 60_000
    });
    expect(resolveDiscoveryLeadTarget("storefront_product", "https://creator.itch.io/shader-pack")).toEqual({
      platform: "itch",
      purpose: "metadata",
      url: "https://creator.itch.io/shader-pack",
      minDelayMs: 1500
    });
    expect(resolveDiscoveryLeadTarget("storefront_product", "https://payhip.com/b/sample-vrc-item")).toEqual({
      platform: "custom_domain",
      purpose: "metadata",
      url: "https://payhip.com/b/sample-vrc-item",
      minDelayMs: 2000
    });
    expect(resolveDiscoveryLeadTarget("storefront_product", "https://ko-fi.com/s/sample-vrc-item")).toEqual({
      platform: "custom_domain",
      purpose: "metadata",
      url: "https://ko-fi.com/s/sample-vrc-item",
      minDelayMs: 2000
    });
    expect(resolveDiscoveryLeadTarget("publisher_site", "https://artist.example.org/")).toEqual({
      platform: "custom_domain",
      purpose: "metadata",
      url: "https://artist.example.org/",
      minDelayMs: 2000
    });
    expect(resolveDiscoveryLeadTarget("release_zip", "https://example.org/tool.zip")).toBeNull();
    expect(resolveDiscoveryLeadTarget("creator_profile", "https://profiles.example.org/artist")).toBeNull();
  });
});
