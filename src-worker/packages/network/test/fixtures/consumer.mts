import { ClaimRequestSchema, NodeRobotsClaimRequestSchema, NodeRobotsResultRequestSchema,
  PriorityLaneSchema, VpmQualityFlagSchema, NodeAvatarCompatibilitySchema,
  NodeDesktopToolSubtypeSchema, NodeDesktopToolEvidenceSchema, NodeVrchatRelevanceSchema,
  type ClaimRequest, type CrawlJob, type Observation, type Platform, type PriorityLane,
  type VpmQualityFlag, type NodeAvatarCompatibility, type NodeDesktopToolSubtype,
  type NodeDesktopToolEvidence, type NodeVrchatRelevance, type ResultOutcome,
  type ResultRequest, type ResultResponse,
  type NodeRobotsClaimRequest, type NodeRobotsClaimResponse,
  type NodeRobotsResultRequest, type NodeRobotsResultResponse } from 'vrc-packages-network/node';
import { IDENTITY_PREFIX, NODE_TOKEN_REGEX } from 'vrc-packages-api/auth';
import { PLATFORM_BIT_MAP, ALL_CAPABILITIES_MASK, CAPABILITY_TOKEN_REGEX,
  encodeCapabilityCode, decodeCapabilityCode, isCapabilityToken,
  formatCapabilityToken, parseCapabilityToken, type ParsedCapabilityToken } from 'vrc-packages-network/token';
import { type EvidenceClass } from 'vrc-packages-network/evidence';
import { isIp, isPrivateOrReservedIp } from 'vrc-packages-network/ip-policy';
import { ARCHIVE_BINARY_EXTENSIONS, classifyOutboundLeadKind, isArchiveOrBinaryUrl,
  isBoothBrowseTarget, isGumroadBrowseTarget, isGumroadProductTarget, isItchTagTarget,
  isJinxxyBrowseTarget, isStorefrontProductTarget, isValidPublicHttpsOrigin,
  normalizeGitHubApiUrl, normalizeGitHubRepositoryUrl,
  resolveDiscoveryLeadTarget, type ResolvedDiscoveryLeadTarget } from 'vrc-packages-network/source-targets';
import { cleanTitle, cleanTrackingParams, extractBracketTokens, unescapeHtml } from 'vrc-packages-network/catalog-hygiene';
import { type OriginRobotsSnapshot } from 'vrc-packages-network/robots';
import { type RobotsFetcher, retrieveRobotsSnapshot } from 'vrc-packages-network/robots-retrieval';
import { crawlerUserAgent } from 'vrc-packages-network/identity';

const claim: ClaimRequest = ClaimRequestSchema.parse({ schemaVersion: 1, nodeId: 'types-node', capabilities: ['vpm'] });
const evidence: EvidenceClass = 'normalized_facts';
const lane: PriorityLane = PriorityLaneSchema.parse(1);
const qualityFlag: VpmQualityFlag = VpmQualityFlagSchema.parse('skeleton');
const toolSubtype: NodeDesktopToolSubtype = NodeDesktopToolSubtypeSchema.parse('osc_control');
const avatarCompat: NodeAvatarCompatibility = NodeAvatarCompatibilitySchema.parse({
  targetAvatarBase: 'kikyo', scope: 'named_base', confidence: 'creator_declared', evidenceSource: 'title'
});
const desktopEvidence: NodeDesktopToolEvidence = NodeDesktopToolEvidenceSchema.parse({
  toolSubtype, supportedOS: ['windows'], particularVRChatTarget: true, publisherClaim: 'OSC tool'
});
const relevance: NodeVrchatRelevance = NodeVrchatRelevanceSchema.parse({ isRelevant: true, confidence: 0.9 });
const job: CrawlJob = { jobId: 'types-job', leaseId: crypto.randomUUID(), platform: 'vpm', purpose: 'metadata',
  url: 'https://example.org/index.json', origin: 'https://example.org', leaseExpiresAt: '2099-01-01T00:00:00.000Z',
  retainClasses: [evidence], etag: null, lastModified: null, priorityLane: lane, paginationDepth: 0, maxPaginationDepth: 5 };
const observation: Observation = {
  sourceItemKey: 'vpm:com.example.tool', title: 'Example Tool', author: 'Author', summary: 'Summary',
  outboundLinks: ['https://example.org/index.json'], originUpdatedAt: null,
  ownerKey: 'author', ownerName: 'Author', qualityFlags: [qualityFlag],
  avatarCompatibilities: [avatarCompat], desktopToolEvidence: desktopEvidence, vrchatRelevance: relevance
};
const discoveryOutcome: ResultOutcome = { kind: 'discovery', leads: [], nextPageLead: null };
const result: ResultRequest = { schemaVersion: 1, nodeId: claim.nodeId, jobId: job.jobId,
  leaseId: job.leaseId, idempotencyKey: crypto.randomUUID(), outcome: { kind: 'unchanged' } };
const receipt: ResultResponse = { schemaVersion: 1, status: 'accepted', jobId: result.jobId,
  duplicate: false, sourceVersionCreated: false };
const robotsClaimReq: NodeRobotsClaimRequest = NodeRobotsClaimRequestSchema.parse({ schemaVersion: 1, nodeId: 'types-node' });
const robotsClaimRes: NodeRobotsClaimResponse = { schemaVersion: 1, status: 'empty', retryAfterMs: 60000 };
const robotsResultReq: NodeRobotsResultRequest = NodeRobotsResultRequestSchema.parse({
  schemaVersion: 1, nodeId: 'types-node', origin: 'https://example.org',
  leaseId: crypto.randomUUID(), statusCode: 404
});
const robotsResultRes: NodeRobotsResultResponse = { schemaVersion: 1, status: 'accepted', origin: 'https://example.org' };
const bitValue: number = PLATFORM_BIT_MAP.vpm;
const allMask: number = ALL_CAPABILITIES_MASK;
const capRegex: RegExp = CAPABILITY_TOKEN_REGEX;
const sdkTokenRegex: RegExp = NODE_TOKEN_REGEX;
const encodedCaps: string = encodeCapabilityCode(['vpm']);
const decodedCaps: Platform[] | null = decodeCapabilityCode(encodedCaps);
const formattedToken: string = formatCapabilityToken(['vpm']);
const tokenValid: boolean = isCapabilityToken(formattedToken) && formattedToken.startsWith(IDENTITY_PREFIX);
const parsedToken: ParsedCapabilityToken | null = parseCapabilityToken(formattedToken);
const ipCheck: boolean = isIp('127.0.0.1') && isPrivateOrReservedIp('127.0.0.1');
const originValid: boolean = isValidPublicHttpsOrigin('https://booth.pm');
const binaryBlocked: boolean = ARCHIVE_BINARY_EXTENSIONS.includes('.vpmz') && isArchiveOrBinaryUrl('https://example.org/a.zip');
const browseValid: boolean = isBoothBrowseTarget('https://booth.pm/ja/browse/Tools') &&
  isGumroadBrowseTarget('https://gumroad.com/discover') &&
  isGumroadProductTarget('https://creator.gumroad.com/l/item') &&
  isJinxxyBrowseTarget('https://jinxxy.com/sitemap.xml') &&
  isItchTagTarget('https://itch.io/tools/tag-vrchat');
const leadKind = classifyOutboundLeadKind('https://creator.itch.io/tool');
const resolvedLead: ResolvedDiscoveryLeadTarget | null = leadKind ? resolveDiscoveryLeadTarget(leadKind, 'https://creator.itch.io/tool') : null;
const ghNorm: string | null = normalizeGitHubRepositoryUrl('https://github.com/owner/repo.git');
const ghApi: string | null = normalizeGitHubApiUrl('https://github.com/owner/repo');
const storefrontOk: boolean = isStorefrontProductTarget('booth', 'https://booth.pm/ja/items/12345');
const decodedHtml: string = unescapeHtml('&amp;');
const bracketTokens: string[] = extractBracketTokens('【Kikyo】 Tool');
const cleanedTitle: string = cleanTitle('【Kikyo】 Tool', { preserveBrackets: true });
const cleanedUrl: string = cleanTrackingParams('https://example.org/?utm_source=test');
const fetcher: RobotsFetcher = async () => new Response(null, { status: 404 });
const snapshot: OriginRobotsSnapshot = await retrieveRobotsSnapshot({ origin: job.origin,
  userAgent: crawlerUserAgent('0.0.0') }, fetcher);
void observation; void discoveryOutcome; void receipt; void snapshot; void robotsClaimReq; void robotsClaimRes;
void robotsResultReq; void robotsResultRes; void bitValue; void allMask; void capRegex; void sdkTokenRegex; void decodedCaps;
void tokenValid; void parsedToken; void ipCheck; void originValid; void binaryBlocked; void browseValid;
void resolvedLead; void ghNorm; void ghApi; void storefrontOk; void decodedHtml; void bracketTokens;
void cleanedTitle; void cleanedUrl;

// @ts-expect-error Node job contracts are not consumer SDK exports.
import { CrawlJobSchema } from 'vrc-packages-api';
// @ts-expect-error Package source paths are not published exports.
import { PlatformSchema } from 'vrc-packages-network/src/protocol/node_protocol.ts';
// @ts-expect-error Wrong protocol version must not satisfy the declared request.
const invalidClaim: ClaimRequest = { schemaVersion: 2, nodeId: 'types-node', capabilities: ['vpm'] };
// @ts-expect-error "curated" was purged from PlatformSchema.
const invalidPlatform: Platform = 'curated';
void CrawlJobSchema; void PlatformSchema; void invalidClaim; void invalidPlatform;
