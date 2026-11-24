import { VRCPackageClient, type VRCPackageClientOptions } from 'vrc-packages-api';
import {
  RevokeNodeRequestSchema,
  type PublicCatalogListQuery,
  type PublicCatalogListResponse,
  type ReportSubmissionRequest,
  type DemandSignalReportRequest,
  type RelationshipFeedbackReportRequest,
  type IssueReportRequest,
  type RemovalReportRequest,
  type OperatorNodeRecord,
  type OperatorNodeListQuery,
  type OperatorNodeListResponse,
  type OperatorJobRecord,
  type OperatorJobListQuery,
  type OperatorJobListResponse,
  type OperatorStatusResponse,
  type SystemPurgeResponse,
  type SteeringProfile,
  type SuppressedTarget
} from 'vrc-packages-api/protocol';
import { type CatalogPackage, type Platform } from 'vrc-packages-api/types';
import { UmbrellaSchema } from 'vrc-packages-api/taxonomy';
import { isAppToken, isNodeToken, NODE_TOKEN_REGEX } from 'vrc-packages-api/auth';

// @ts-expect-error Deprecated Wave 1 feedback symbols were retired from the public SDK.
import type { FeedbackSignalType, DownstreamFeedbackRequest, DownstreamFeedbackResponse } from 'vrc-packages-api/protocol';

// @ts-expect-error Version-zero SDK does not retain the old client spelling.
import { VRCPackagesClient } from 'vrc-packages-api';
// @ts-expect-error Version-zero SDK does not retain the old options spelling.
import type { VRCPackagesClientOptions } from 'vrc-packages-api';
// @ts-expect-error The P in VRCP already stands for Packages.
import { VRCPPackageClient } from 'vrc-packages-api';
// @ts-expect-error The options name must not repeat Package after VRCP.
import type { VRCPPackageClientOptions } from 'vrc-packages-api';

// @ts-expect-error Coordinator classification types are not consumer API contracts.
import type { DesktopToolSubtype } from 'vrc-packages-api/taxonomy';
// @ts-expect-error Coordinator evidence is private, not a published API response.
import type { DesktopToolEvidence } from 'vrc-packages-api';
// @ts-expect-error Coordinator compatibility storage is not a published API response.
import type { AvatarCompatibility } from 'vrc-packages-api';

// @ts-expect-error Curated platform was purged from the Version 0 Platform enum.
const retiredCuratedPlatform: Platform = 'curated';
void retiredCuratedPlatform;

const options: VRCPackageClientOptions = { baseUrl: 'https://example.test' };
const client = new VRCPackageClient(options);
const platform: Platform = 'vpm';
RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason: 'Type fixture' });
void [client, platform, UmbrellaSchema, isAppToken, isNodeToken, NODE_TOKEN_REGEX];

async function checkPublicIndexTypes() {
  const query: PublicCatalogListQuery = { limit: 100 };
  const page: PublicCatalogListResponse = await client.index.query(query);
  const version: 1 = page.schemaVersion;
  const cursor: string | null = page.nextCursor;
  const first: CatalogPackage | undefined = page.packages[0];
  if (first) {
    void [first.ownerKey, first.ownerName, first.verificationStatus, first.qualityFlags, first.relations, first.sources];
    // @ts-expect-error acceptedLinks was purged from CatalogPackage.
    void first.acceptedLinks;
    // @ts-expect-error fronts was purged from CatalogPackage.
    void first.fronts;
  }
  if (cursor) await client.index.query({ cursor });
  // @ts-expect-error Public index is unfiltered. Search requires the authenticated search route.
  await client.index.query({ query: 'avatar' });
  // @ts-expect-error A page receipt has no synthetic total count.
  void page.count;
  void version;
}
void checkPublicIndexTypes;

async function checkSearchPaginationTypes() {
  const page = await client.index.search({ queryOrigin: 'app_automated', cursor: null, limit: 1 });
  if (page.nextCursor) await client.index.search({ queryOrigin: 'app_automated', cursor: page.nextCursor, limit: 1 });
  // @ts-expect-error Search cursors are nullable text, not numeric offsets.
  await client.index.search({ queryOrigin: 'app_automated', cursor: 1 });
}
void checkSearchPaginationTypes;

async function checkStrictLeadTypes() {
  const page = await client.operator.leads.list();
  for (const lead of page.leads) {
    const key: string = lead.lead_key;
    const host: string = lead.target_host;
    // @ts-expect-error Lead wire rows have no camel-case alias.
    void lead.leadKey;
    await client.operator.leads.approve(key, { reason: 'Reviewed listing' });
    // @ts-expect-error Operators must supply an approval reason.
    await client.operator.leads.approve(key);
    // @ts-expect-error Operators must supply a rejection reason.
    await client.operator.leads.reject(key, {});
    await client.operator.leads.bulkApprove({ schemaVersion: 1, leadKeys: [key], priorityLane: 1, reason: 'Bulk batch' });
    await client.operator.leads.suppressDomain({ schemaVersion: 1, targetHost: host, reason: 'Blocked domain' });
  }
}
void checkStrictLeadTypes;

async function checkNarrowedReportsAndQueryLimits(report: ReportSubmissionRequest) {
  if (report.reportType === 'demand_signal') {
    const d: DemandSignalReportRequest = report;
    // @ts-expect-error demand_signal requests do not accept reportKind.
    void report.reportKind;
    void d.signalKind;
  } else if (report.reportType === 'relationship_feedback') {
    const f: RelationshipFeedbackReportRequest = report;
    // @ts-expect-error relationship_feedback requests do not accept reportKind.
    void report.reportKind;
    void f.vote;
  } else if (report.reportType === 'issue_report') {
    const i: IssueReportRequest = report;
    // @ts-expect-error issue_report requests do not accept query or zeroHits.
    void report.query;
    void i.reportKind;
  } else {
    const r: RemovalReportRequest = report;
    // @ts-expect-error removal_request requests do not accept signalKind or reportKind.
    void report.signalKind;
    void r.reason;
  }
  // @ts-expect-error User and moderator query limits must be numbers, not strings.
  await client.user.apps.list({ limit: '10' });
  // @ts-expect-error Moderator rating query limits must be numbers, not strings.
  await client.moderator.ratings.list({ limit: '10' });
  // @ts-expect-error Moderator app query limits must be numbers, not strings.
  await client.moderator.apps.list({ limit: '10' });
}
void checkNarrowedReportsAndQueryLimits;

async function checkOperatorListingTypes() {
  const status: OperatorStatusResponse = await client.operator.status();
  void status.purgeEnabled;
  const purgeRes: SystemPurgeResponse = await client.operator.systemPurge({
    schemaVersion: 1,
    confirm: 'PURGE_DEVELOPMENT_D1'
  });
  void purgeRes.preservedNodes;

  // @ts-expect-error Coordinator autoSeed: true is removed in Version 0.
  await client.operator.init({ autoSeed: true });

  // @ts-expect-error Manual node capability picking is removed; Coordinator assigns capabilities.
  await client.operator.nodes.issue({ schemaVersion: 1, nodeId: 'node-1', capabilities: ['vpm'], reason: 'Invalid manual caps' });

  const nodeQuery: OperatorNodeListQuery = { status: 'active', limit: 25 };
  const nodePage: OperatorNodeListResponse = await client.operator.nodes.list(nodeQuery);
  const firstNode: OperatorNodeRecord | undefined = nodePage.nodes[0];
  if (firstNode) {
    const id: string = firstNode.nodeId;
    // @ts-expect-error Node list records never expose credential tokens.
    void firstNode.token;
    // @ts-expect-error Node list records never expose credential token hashes.
    void firstNode.token_hash;
    void id;
  }
  const jobQuery: OperatorJobListQuery = { state: 'leased', platform: 'booth', priorityLane: 2, limit: 50 };
  const jobPage: OperatorJobListResponse = await client.operator.jobs.list(jobQuery);
  const firstJob: OperatorJobRecord | undefined = jobPage.jobs[0];
  if (firstJob) {
    const jid: string = firstJob.jobId;
    void [firstJob.priorityLane, firstJob.steeringProfileId, firstJob.claimabilityBlockers];
    // @ts-expect-error Crawl job list records never expose active lease secrets.
    void firstJob.leaseId;
    // @ts-expect-error Crawl job list records never expose active snake-case lease secrets.
    void firstJob.lease_id;
    await client.operator.jobs.update(jid, { priorityLane: 1, reason: 'Prioritize job' });
    await client.operator.jobs.requeue(jid, { reason: 'Requeue immediately' });
    await client.operator.jobs.delete(jid, 'Delete obsolete job');
  }

  const profilesPage = await client.operator.steeringProfiles.list();
  const profile: SteeringProfile | undefined = profilesPage.profiles[0];
  if (profile) {
    await client.operator.steeringProfiles.update(profile.profileId, { minDelayMs: 2500, reason: 'Slow down' });
    await client.operator.steeringProfiles.enable(profile.profileId, 'Re-enable profile');
    await client.operator.steeringProfiles.disable(profile.profileId, 'Disable profile');
    await client.operator.steeringProfiles.delete(profile.profileId, 'Delete profile');
  }

  const suppressedPage = await client.operator.suppressedTargets.list();
  const target: SuppressedTarget | undefined = suppressedPage.targets[0];
  if (target) {
    await client.operator.suppressedTargets.delete({ schemaVersion: 1, target: target.target, reason: 'Unblock' });
  }

  // @ts-expect-error Operator node list limits must be numbers, not strings.
  await client.operator.nodes.list({ limit: '10' });
  // @ts-expect-error Operator job list limits must be numbers, not strings.
  await client.operator.jobs.list({ limit: '10' });
}
void checkOperatorListingTypes;
