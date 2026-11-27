import { describe, expect, spyOn, test } from "bun:test";
import { IssueNodeCredentialSchema } from "vrc-packages-api";
import { NODE_TOKEN_REGEX } from "vrc-packages-api/auth";
import {
  MAX_ROBOTS_BYTES,
  OriginRobotsSnapshotSchema,
  RobotsBodySchema,
  RobotsOriginSchema,
  RobotsStatusCodeSchema,
  robotsResultAllowsMissingFile
} from "../src/robots/robots_snapshot.ts";
import {
  CrawlJobSchema,
  NODE_API_JSON_SCHEMAS,
  NodeAvatarCompatibilitySchema,
  NodeDesktopToolEvidenceSchema,
  NodeDesktopToolSubtypeSchema,
  NodeIdSchema,
  NodeRobotsClaimRequestSchema,
  NodeRobotsClaimResponseSchema,
  NodeRobotsResultRequestSchema,
  NodeRobotsResultResponseSchema,
  NodeVrchatRelevanceSchema,
  ObservationSchema,
  PlatformSchema,
  PriorityLaneSchema,
  ResultOutcomeSchema,
  STOREFRONT_PLATFORMS,
  VpmQualityFlagSchema,
  type Platform
} from "../src/protocol/node_protocol.ts";
import {
  ALL_CAPABILITIES_MASK,
  CAPABILITY_TOKEN_REGEX,
  PLATFORM_BIT_MAP,
  decodeCapabilityCode,
  encodeCapabilityCode,
  formatCapabilityToken,
  isCapabilityToken,
  parseCapabilityToken
} from "../src/token.ts";
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
  isGumroadBrowseTarget,
  isGumroadProductTarget,
  isItchProductTarget,
  isItchTagTarget,
  isJinxxyBrowseTarget,
  isJinxxyProductTarget,
  isSellfyProductTarget,
  isShopifyProductSitemapTarget,
  isShopifyProductTarget,
  isStorefrontProductTarget,
  isValidPublicHttpsOrigin,
  normalizeGitHubApiUrl,
  normalizeGitHubRepositoryUrl,
  parseGitHubOwnerRepo,
  resolveDiscoveryLeadTarget,
  sellfyProductIdentity,
  shopifyProductLead
} from "../src/policy/source_targets.ts";
import {
  cleanTitle,
  cleanTrackingParams,
  extractBracketTokens,
  unescapeHtml
} from "../src/text/catalog_hygiene.ts";

describe("vrc-packages-network unit contracts", () => {
  test("preserves NodeIdSchema reference equality with vrc-packages-api", () => {
    expect(NodeIdSchema).toBe(IssueNodeCredentialSchema.shape.nodeId);
  });

  test("purges curated from PlatformSchema and validates Version 0 wire extensions", () => {
    expect(PlatformSchema.options).toEqual([
      "booth", "github", "vpm", "gumroad", "jinxxy", "itch", "shopify", "sellfy", "custom_domain"
    ]);
    expect(PlatformSchema.options).toHaveLength(9);
    expect(PlatformSchema.safeParse("curated").success).toBe(false);
    expect(STOREFRONT_PLATFORMS.size).toBe(7);

    for (const lane of [1, 2, 3, 4] as const) {
      expect(PriorityLaneSchema.parse(lane)).toBe(lane);
    }
    for (const badLane of [0, 5, 1.5, "1"]) {
      expect(PriorityLaneSchema.safeParse(badLane).success).toBe(false);
    }

    for (const flag of ["skeleton", "fork_suspected", "missing_release", "incomplete_metadata", "missing_zip_sha256"] as const) {
      expect(VpmQualityFlagSchema.parse(flag)).toBe(flag);
    }
    expect(VpmQualityFlagSchema.safeParse("fabricated").success).toBe(false);

    expect(NodeAvatarCompatibilitySchema.parse({
      targetAvatarBase: "kikyo",
      scope: "named_base",
      confidence: "creator_declared",
      evidenceSource: "title"
    }).targetAvatarBase).toBe("kikyo");
    expect(NodeAvatarCompatibilitySchema.safeParse({
      targetAvatarBase: "kikyo",
      scope: "named_base",
      confidence: "creator_declared",
      evidenceSource: "title",
      extra: true
    }).success).toBe(false);

    expect(NodeDesktopToolSubtypeSchema.parse("osc_control")).toBe("osc_control");
    expect(NodeDesktopToolEvidenceSchema.parse({
      toolSubtype: "tracking_bridge",
      supportedOS: ["windows", "linux"],
      particularVRChatTarget: true,
      evidenceUrl: "https://github.com/example/tracker",
      publisherClaim: "VRChat OSC tracking bridge"
    }).supportedOS).toEqual(["windows", "linux"]);
    expect(NodeDesktopToolEvidenceSchema.safeParse({
      toolSubtype: "tracking_bridge",
      supportedOS: [],
      particularVRChatTarget: true,
      publisherClaim: ""
    }).success).toBe(false);

    expect(NodeVrchatRelevanceSchema.parse({
      isRelevant: true,
      confidence: 0.92,
      matchedSignals: ["vpm", "vrchat"]
    }).confidence).toBe(0.92);
    expect(NodeVrchatRelevanceSchema.safeParse({
      isRelevant: false,
      confidence: 1.5
    }).success).toBe(false);

    const leaseId = crypto.randomUUID();
    const job = CrawlJobSchema.parse({
      jobId: "job-v0",
      leaseId,
      platform: "booth",
      purpose: "discovery",
      url: "https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB?page=1",
      origin: "https://booth.pm",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
      retainClasses: ["normalized_facts"],
      etag: null,
      lastModified: null,
      priorityLane: 2,
      paginationDepth: 1,
      maxPaginationDepth: 10
    });
    expect(job.priorityLane).toBe(2);
    expect(CrawlJobSchema.safeParse({ ...job, priorityLane: 5 }).success).toBe(false);
    expect(CrawlJobSchema.safeParse({ ...job, paginationDepth: 501 }).success).toBe(false);

    const observation = ObservationSchema.parse({
      sourceItemKey: "booth:12345",
      title: "Sample Outfit",
      author: "Creator",
      summary: "Functional tool summary",
      outboundLinks: ["https://booth.pm/ja/items/12345"],
      originUpdatedAt: "2026-11-24T00:00:00.000Z",
      ownerKey: "booth:creator",
      ownerName: "Creator",
      qualityFlags: ["incomplete_metadata"],
      avatarCompatibilities: [{
        targetAvatarBase: "kikyo",
        scope: "named_base",
        confidence: "creator_declared",
        evidenceSource: "title"
      }],
      desktopToolEvidence: null,
      vrchatRelevance: {
        isRelevant: true,
        confidence: 0.95,
        matchedSignals: ["kikyo", "vrchat"]
      }
    });
    expect(observation.ownerKey).toBe("booth:creator");

    const discoveryOutcome = ResultOutcomeSchema.parse({
      kind: "discovery",
      leads: [{ kind: "storefront_product", url: "https://booth.pm/ja/items/12345" }],
      nextPageLead: "https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB?page=2"
    });
    expect(discoveryOutcome.kind).toBe("discovery");
    expect(ResultOutcomeSchema.safeParse({
      kind: "discovery",
      leads: [],
      nextPageLead: null
    }).success).toBe(true);
    expect(ResultOutcomeSchema.safeParse({
      kind: "discovery",
      leads: [],
      nextPageLead: "http://booth.pm/ja/browse/Tools?page=2"
    }).success).toBe(false);
    expect(ResultOutcomeSchema.safeParse({
      kind: "discovery",
      leads: [],
      nextPageLead: `https://booth.pm/ja/browse/${"a".repeat(2040)}`
    }).success).toBe(false);

    for (const key of Object.keys(NODE_API_JSON_SCHEMAS) as (keyof typeof NODE_API_JSON_SCHEMAS)[]) {
      expect(typeof NODE_API_JSON_SCHEMAS[key]).toBe("object");
    }
  });

  test("encodes, decodes, formats, and parses 0x01ff capability tokens without silent fallbacks", () => {
    expect(ALL_CAPABILITIES_MASK).toBe(0x01ff);
    expect(CAPABILITY_TOKEN_REGEX.source).toBe(NODE_TOKEN_REGEX.source);
    expect("curated" in PLATFORM_BIT_MAP).toBe(false);

    const seenBits = new Set<number>();
    for (const platform of PlatformSchema.options) {
      const bit = PLATFORM_BIT_MAP[platform];
      expect(bit).toBeGreaterThan(0);
      expect(bit & ALL_CAPABILITIES_MASK).toBe(bit);
      expect(seenBits.has(bit)).toBe(false);
      seenBits.add(bit);
    }
    expect(seenBits.size).toBe(9);

    expect(encodeCapabilityCode(["booth"])).toBe("0001");
    expect(encodeCapabilityCode(["github"])).toBe("0002");
    expect(encodeCapabilityCode(["vpm"])).toBe("0004");
    expect(encodeCapabilityCode(["gumroad"])).toBe("0008");
    expect(encodeCapabilityCode(["jinxxy"])).toBe("0010");
    expect(encodeCapabilityCode(["itch"])).toBe("0020");
    expect(encodeCapabilityCode(["shopify"])).toBe("0040");
    expect(encodeCapabilityCode(["sellfy"])).toBe("0080");
    expect(encodeCapabilityCode(["custom_domain"])).toBe("0100");
    expect(encodeCapabilityCode(["vpm", "github"])).toBe("0006");
    expect(encodeCapabilityCode(["booth", "shopify"])).toBe("0041");
    expect(encodeCapabilityCode(PlatformSchema.options)).toBe("01ff");

    expect(() => encodeCapabilityCode([])).toThrow();
    expect(() => encodeCapabilityCode(["curated" as unknown as Platform])).toThrow();
    expect(() => encodeCapabilityCode(["toString" as unknown as Platform])).toThrow();

    for (const platform of PlatformSchema.options) {
      expect(decodeCapabilityCode(encodeCapabilityCode([platform]))).toEqual([platform]);
    }
    expect(decodeCapabilityCode("01ff")).toEqual([...PlatformSchema.options]);
    expect(decodeCapabilityCode("0000")).toBeNull();
    expect(decodeCapabilityCode("0200")).toBeNull();
    expect(decodeCapabilityCode("03ff")).toBeNull();
    expect(decodeCapabilityCode("ffff")).toBeNull();
    expect(decodeCapabilityCode("xyz1")).toBeNull();
    expect(decodeCapabilityCode("001")).toBeNull();
    expect(decodeCapabilityCode("00001")).toBeNull();

    const nativeRandom = crypto.getRandomValues.bind(crypto);
    const randomSpy = spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      expect(array).toBeInstanceOf(Uint8Array);
      expect(array!.byteLength).toBe(32);
      return nativeRandom(array);
    });
    try {
      const token = formatCapabilityToken(["vpm", "github"]);
      expect(randomSpy).toHaveBeenCalledTimes(1);
      expect(token.length).toBe(73);
      expect(isCapabilityToken(token)).toBe(true);
      const parsed = parseCapabilityToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe("0006");
      expect(parsed?.capabilities).toEqual(["github", "vpm"]);
      expect(parsed?.entropy.length).toBe(64);
    } finally {
      randomSpy.mockRestore();
    }

    const explicitToken = formatCapabilityToken(["vpm"], "A".repeat(64));
    expect(explicitToken).toBe(`vrcp_${"a".repeat(64)}0004`);
    expect(() => formatCapabilityToken(["vpm"], "")).toThrow();
    expect(() => formatCapabilityToken(["vpm"], "not-64-hex")).toThrow();
    expect(() => formatCapabilityToken(["vpm"], "g".repeat(64))).toThrow();
    expect(() => formatCapabilityToken([])).toThrow();

    expect(parseCapabilityToken("invalid")).toBeNull();
    expect(parseCapabilityToken(`vrcp_${"a".repeat(64)}0000`)).toBeNull();
    expect(parseCapabilityToken(`vrcp_${"a".repeat(64)}0200`)).toBeNull();
    expect(parseCapabilityToken(`vrcp_${"a".repeat(64)}03ff`)).toBeNull();
    expect(parseCapabilityToken(`vrcp_${"a".repeat(32)}0004`)).toBeNull();
    expect(parseCapabilityToken(`vrc_cap_0004_${"a".repeat(64)}`)).toBeNull();
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

  test("validates public HTTPS origins and rejects SSRF, ports, credentials, and internal hosts", () => {
    expect(isValidPublicHttpsOrigin("https://booth.pm")).toBe(true);
    expect(isValidPublicHttpsOrigin("https://store.example.org")).toBe(true);
    expect(isValidPublicHttpsOrigin("https://8.8.8.8")).toBe(true);

    for (const invalidOrigin of [
      "",
      "http://booth.pm",
      "https://booth.pm/",
      "https://booth.pm:443",
      "https://booth.pm:8443",
      "https://user:pass@booth.pm",
      "https://booth.pm.",
      "https://booth.pm?q=1",
      "https://booth.pm#frag",
      " https://booth.pm",
      "https://localhost",
      "https://sub.localhost",
      "https://service.internal",
      "https://printer.local",
      "https://intranet",
      "https://127.0.0.1",
      "https://169.254.169.254",
      "https://[::1]"
    ]) {
      expect(isValidPublicHttpsOrigin(invalidOrigin)).toBe(false);
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

  test("recognizes 7-lane browse targets, creator subdomains, and outbound discovery leads", () => {
    expect(isBoothBrowseTarget("https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB?page=1")).toBe(true);
    expect(isBoothBrowseTarget("https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB")).toBe(true);
    expect(isBoothBrowseTarget("https://booth.pm/en/browse/Tools?sort=new&tags[]=VRChat&page=2")).toBe(true);
    expect(isBoothBrowseTarget("https://booth.pm/ja/browse/Tools?tags%5B%5D=VRChat")).toBe(true);
    expect(isBoothBrowseTarget("https://booth.pm/ja/browse/Tools?page=0")).toBe(false);
    expect(isBoothBrowseTarget("https://booth.pm/ja/browse/Tools?page=1&utm_source=x")).toBe(false);
    expect(isBoothBrowseTarget("https://booth.pm/ja/browse/Tools?page=1&page=2")).toBe(false);
    expect(isBoothBrowseTarget("https://booth.pm/ja/browse/Tools?")).toBe(false);
    expect(isBoothBrowseTarget("https://booth.pm/ja/items/123")).toBe(false);

    expect(boothItemIdentity("https://booth.pm/items/123")).toBe("123");
    expect(boothItemIdentity("https://creator.booth.pm/items/987")).toBe("987");
    expect(boothItemIdentity("https://a.b.booth.pm/items/987")).toBeNull();
    expect(isBoothProductTarget("https://booth.pm/ja/items/456789")).toBe(true);
    expect(isBoothProductTarget("https://creator.booth.pm/ja/items/456789")).toBe(true);
    expect(isBoothProductTarget("https://-bad.booth.pm/items/456789")).toBe(false);

    expect(isGumroadBrowseTarget("https://gumroad.com/discover")).toBe(true);
    expect(isGumroadBrowseTarget("https://gumroad.com/discover/3d?query=vrchat&page=1")).toBe(true);
    expect(isGumroadBrowseTarget("https://gumroad.com/vrchat")).toBe(true);
    expect(isGumroadBrowseTarget("https://gumroad.com/discover?utm_source=x")).toBe(false);
    expect(isGumroadBrowseTarget("https://gumroad.com/discover?page=0")).toBe(false);
    expect(isGumroadBrowseTarget("https://gumroad.com/discover/tool.zip")).toBe(false);
    expect(isGumroadBrowseTarget("https://creator.gumroad.com/discover")).toBe(false);
    expect(isGumroadBrowseTarget("https://gumroad.com/l/awesome-avatar")).toBe(false);

    expect(isGumroadProductTarget("https://gumroad.com/l/awesome-avatar")).toBe(true);
    expect(isGumroadProductTarget("https://creator.gumroad.com/l/awesome-avatar")).toBe(true);
    expect(isGumroadProductTarget("https://a.b.gumroad.com/l/awesome-avatar")).toBe(false);
    expect(isGumroadProductTarget("https://bad-.gumroad.com/l/awesome-avatar")).toBe(false);

    expect(isJinxxyBrowseTarget("https://jinxxy.com/sitemap.xml")).toBe(true);
    expect(isJinxxyBrowseTarget("https://jinxxy.com/sitemap_products.xml")).toBe(true);
    expect(isJinxxyBrowseTarget("https://jinxxy.com/sitemaps/market_1.xml")).toBe(true);
    expect(isJinxxyBrowseTarget("https://jinxxy.com/market")).toBe(true);
    expect(isJinxxyBrowseTarget("https://jinxxy.com/market/avatars?page=2&sort=popular")).toBe(true);
    expect(isJinxxyBrowseTarget("https://jinxxy.com/sitemap.xml?page=1")).toBe(false);
    expect(isJinxxyBrowseTarget("https://jinxxy.com/market/avatars?utm_source=tracker")).toBe(false);
    expect(isJinxxyBrowseTarget("https://jinxxy.com/coolcreator/particle-gimmick")).toBe(false);
    expect(isJinxxyProductTarget("https://jinxxy.com/coolcreator/particle-gimmick")).toBe(true);
    expect(isJinxxyProductTarget("https://jinxxy.com/market/avatars")).toBe(false);

    expect(isItchTagTarget("https://itch.io/tools/tag-vrchat")).toBe(true);
    expect(isItchTagTarget("https://itch.io/tools/tag-vrchat?page=1")).toBe(true);
    expect(isItchTagTarget("https://itch.io/game-assets/tag-vrchat/tag-udon?page=3")).toBe(true);
    expect(isItchTagTarget("https://itch.io/search?q=vrchat")).toBe(false);
    expect(isItchTagTarget("https://itch.io/tools/tag-vrchat?page=0")).toBe(false);
    expect(isItchTagTarget("https://itch.io/tools/tag-vrchat?page=1&utm_source=x")).toBe(false);
    expect(isItchTagTarget("https://creator.itch.io/tools/tag-vrchat")).toBe(false);

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
    expect(isStorefrontProductTarget("booth", "https://creator.booth.pm/items/123")).toBe(true);
    expect(isStorefrontProductTarget("gumroad", "https://creator.gumroad.com/l/avatar")).toBe(true);
    expect(isStorefrontProductTarget("custom_domain", "https://payhip.com/b/sample-vrc-item")).toBe(true);

    expect(classifyOutboundLeadKind("https://github.com/vrcfury/vrcfury")).toBe("github_repository");
    expect(classifyOutboundLeadKind("https://github.com/topics/vrchat")).toBeNull();
    expect(classifyOutboundLeadKind("https://github.com/vrcfury/vrcfury/releases/download/v1/pkg.zip")).toBeNull();
    expect(classifyOutboundLeadKind("https://creator.booth.pm/items/123")).toBe("storefront_product");
    expect(classifyOutboundLeadKind("https://creator.gumroad.com/l/avatar")).toBe("storefront_product");
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
    expect(resolveDiscoveryLeadTarget("storefront_product", "https://creator.booth.pm/items/123")).toEqual({
      platform: "booth",
      purpose: "metadata",
      url: "https://creator.booth.pm/items/123",
      minDelayMs: 1500
    });
    expect(resolveDiscoveryLeadTarget("storefront_product", "https://creator.gumroad.com/l/avatar")).toEqual({
      platform: "gumroad",
      purpose: "metadata",
      url: "https://creator.gumroad.com/l/avatar",
      minDelayMs: 1500
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

  test("decodes HTML entities in a single pass and extracts bracket tokens cleanly", () => {
    expect(unescapeHtml("&amp;&lt;&gt;&quot;&apos;&nbsp;&ndash;&mdash;&hellip;&copy;&reg;&trade;&yen;&euro;&pound;&times;&middot;&lsquo;&rsquo;&ldquo;&rdquo;"))
      .toBe("&<>\"' \u2013\u2014\u2026\u00a9\u00ae\u2122\u00a5\u20ac\u00a3\u00d7\u00b7\u2018\u2019\u201c\u201d");
    expect(unescapeHtml("&#39;&#x27;&#x2F;&#128512;&#x1F600;")).toBe("''/\u{1F600}\u{1F600}");
    expect(unescapeHtml("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
    expect(unescapeHtml("&#99999999; &#xD800; &unknown;")).toBe("&#99999999; &#xD800; &unknown;");

    expect(extractBracketTokens("【Kikyo】［無料］ &amp; [Kikyo] （対応） (Manuka) []")).toEqual([
      "Kikyo", "無料", "対応", "Manuka"
    ]);
    expect(cleanTitle("【Kikyo】［無料］ Dress &amp; Ribbons v1.0", { preserveBrackets: true }))
      .toBe("【Kikyo】[無料] Dress & Ribbons v1.0");
    expect(cleanTitle("[FREE] [VRChat] Advanced Locomotion System v2.1.0 beta"))
      .toBe("Advanced Locomotion System");
    expect(cleanTitle("凪 -Nagi-【オリジナル3Dモデル】")).toBe("凪 -Nagi-");
    expect(cleanTitle("オリジナル3Dモデル「イチゴ」")).toBe("オリジナル3Dモデル「イチゴ」");
    expect(cleanTitle("FREE Sample [VRC想定] Tool (VRChat)")).toBe("Sample Tool");
    expect(cleanTitle("VRChat Shader Pack")).toBe("VRChat Shader Pack");
    expect(cleanTitle("VRChat Particle Shader Asset")).toBe("VRChat Particle Shader Asset");
  });
});
