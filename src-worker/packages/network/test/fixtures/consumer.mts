import { ClaimRequestSchema, NodeRobotsClaimRequestSchema, NodeRobotsResultRequestSchema,
  type ClaimRequest, type CrawlJob, type ResultRequest, type ResultResponse,
  type NodeRobotsClaimRequest, type NodeRobotsClaimResponse,
  type NodeRobotsResultRequest, type NodeRobotsResultResponse } from 'vrc-packages-network/node';
import { type EvidenceClass } from 'vrc-packages-network/evidence';
import { isIp, isPrivateOrReservedIp } from 'vrc-packages-network/ip-policy';
import { ARCHIVE_BINARY_EXTENSIONS, classifyOutboundLeadKind, isArchiveOrBinaryUrl,
  isStorefrontProductTarget, normalizeGitHubApiUrl, normalizeGitHubRepositoryUrl,
  resolveDiscoveryLeadTarget, type ResolvedDiscoveryLeadTarget } from 'vrc-packages-network/source-targets';
import { type OriginRobotsSnapshot } from 'vrc-packages-network/robots';
import { type RobotsFetcher, retrieveRobotsSnapshot } from 'vrc-packages-network/robots-retrieval';
import { crawlerUserAgent } from 'vrc-packages-network/identity';

const claim: ClaimRequest = ClaimRequestSchema.parse({ schemaVersion: 1, nodeId: 'types-node', capabilities: ['vpm'] });
const evidence: EvidenceClass = 'normalized_facts';
const job: CrawlJob = { jobId: 'types-job', leaseId: crypto.randomUUID(), platform: 'vpm', purpose: 'metadata',
  url: 'https://example.org/index.json', origin: 'https://example.org', leaseExpiresAt: '2099-01-01T00:00:00.000Z',
  retainClasses: [evidence], etag: null, lastModified: null };
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
const ipCheck: boolean = isIp('127.0.0.1') && isPrivateOrReservedIp('127.0.0.1');
const binaryBlocked: boolean = ARCHIVE_BINARY_EXTENSIONS.includes('.vpmz') && isArchiveOrBinaryUrl('https://example.org/a.zip');
const leadKind = classifyOutboundLeadKind('https://creator.itch.io/tool');
const resolvedLead: ResolvedDiscoveryLeadTarget | null = leadKind ? resolveDiscoveryLeadTarget(leadKind, 'https://creator.itch.io/tool') : null;
const ghNorm: string | null = normalizeGitHubRepositoryUrl('https://github.com/owner/repo.git');
const ghApi: string | null = normalizeGitHubApiUrl('https://github.com/owner/repo');
const storefrontOk: boolean = isStorefrontProductTarget('booth', 'https://booth.pm/ja/items/12345');
const fetcher: RobotsFetcher = async () => new Response(null, { status: 404 });
const snapshot: OriginRobotsSnapshot = await retrieveRobotsSnapshot({ origin: job.origin,
  userAgent: crawlerUserAgent('0.0.0') }, fetcher);
void receipt; void snapshot; void robotsClaimReq; void robotsClaimRes; void robotsResultReq;
void robotsResultRes; void ipCheck; void binaryBlocked; void resolvedLead; void ghNorm; void ghApi; void storefrontOk;

// @ts-expect-error Node job contracts are not consumer SDK exports.
import { CrawlJobSchema } from 'vrc-packages-api';
// @ts-expect-error Package source paths are not published exports.
import { PlatformSchema } from 'vrc-packages-network/src/protocol/node_protocol.ts';
// @ts-expect-error Wrong protocol version must not satisfy the declared request.
const invalidClaim: ClaimRequest = { schemaVersion: 2, nodeId: 'types-node', capabilities: ['vpm'] };
void CrawlJobSchema; void PlatformSchema; void invalidClaim;
