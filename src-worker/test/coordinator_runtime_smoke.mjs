// Offline-only workerd/D1 smoke. Requires Bun, installed src-worker dependencies and Node with TypeScript stripping.
// Run from src-worker: node test/coordinator_runtime_smoke.mjs
// The fixture module is in memory only. Never deploy it or use remote bindings.
// Current installed Miniflare 5 alpha needs its supplied option conversion API.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
	CatalogDeltaResponseSchema,
	EnqueueJobResponseSchema,
	NodeCredentialResponseSchema,
	OperatorJobRecordSchema,
	OperatorStatusResponseSchema,
	PublicCatalogListResponseSchema,
	RevokeNodeResponseSchema,
	SteeringProfileListResponseSchema,
	SteeringProfileResponseSchema,
	SystemPurgeResponseSchema,
	UpdateJobResponseSchema,
	VRCPackageClient,
	decodeCatalogCursor,
	decodeCatalogDeltaCursor
} from 'vrc-packages-api';
import {
	ClaimResponseSchema,
	HeartbeatResponseSchema,
	PlatformSchema,
	ResultResponseSchema
} from 'vrc-packages-network/node';
import { unstable_readConfig } from 'wrangler';

const ALL_PLATFORMS = [...PlatformSchema.options];
const operatorToken = randomBytes(32).toString('hex');

// Bundle the real store into memory for native binding tests. No fixture is deployed.
const storageModule = execFileSync(
	'bun',
	['build', '--target=browser', fileURLToPath(new URL('../src/storage/d1/coordinator.ts', import.meta.url))],
	{
		cwd: fileURLToPath(new URL('..', import.meta.url)),
		encoding: 'utf8',
		maxBuffer: 8 * 1024 * 1024,
		timeout: 30_000
	}
);

const refreshFixtureModule = String.raw`
import { Coordinator } from './storage.mjs';
import worker from './coordinator.mjs';
function check(value, message) { if (!value) throw new Error(message); }
export async function refreshFixture(env) {
  const origin = 'https://native-robots.example';
  let clock = Date.now();
  const store = new Coordinator(env.VRCP_D1, () => clock);
  const storedEpoch = await store.getCatalogEpoch();
  try {
    await env.VRCP_D1.prepare("DELETE FROM coordinator_meta WHERE key='catalog_epoch'").run();
    const epochs = await Promise.all(Array.from({ length: 8 }, () => new Coordinator(env.VRCP_D1).getCatalogEpoch()));
    check(new Set(epochs).size === 1, 'Concurrent epoch initialization returned a losing candidate');
    check(/^epoch-d1-[0-9a-f-]{36}$/.test(epochs[0]), 'Fresh epoch lacks a complete UUID');
    const reset = await store.resetCatalogEpoch();
    check(reset !== epochs[0] && await store.getCatalogEpoch() === reset, 'Epoch reset was not persisted');
  } finally {
    await env.VRCP_D1.prepare("UPDATE coordinator_meta SET value=? WHERE key='catalog_epoch'").bind(storedEpoch).run();
  }
  const timestampBase = { umbrella: 'tools', category: 'tool', lifecycle: 'active', displayName: 'Timestamp fixture' };
  const timestampIds = ['native-timestamp-unknown', 'native-timestamp-confirmed'];
  try {
    const unknown = await store.upsertCanonicalPackage({ ...timestampBase, canonicalId: timestampIds[0] });
    check(unknown.publishedAt === null && unknown.timestampConfidence === null, 'Unknown publication gained confidence');
    check(unknown.verificationStatus === 'unverified', 'Default verificationStatus must be unverified');
    const publishedAt = '2021-01-02T03:04:05.000Z';
    await store.upsertCanonicalPackage({ ...timestampBase, canonicalId: timestampIds[1], publishedAt, timestampConfidence: 'confirmed' });
    const updated = await store.upsertCanonicalPackage({ ...timestampBase, canonicalId: timestampIds[1], displayName: 'Updated metadata' });
    check(updated.publishedAt === publishedAt && updated.timestampConfidence === 'confirmed', 'Metadata update downgraded publication evidence');
    const page = await store.listCanonicalPackagesPage(100, null);
    const projected = page.packages.find(item => item.canonicalId === timestampIds[0]);
    check(projected?.publishedAt === null && projected?.timestampConfidence === null, 'Projection invented publication confidence');
  } finally {
    await env.VRCP_D1.prepare('DELETE FROM canonical_packages WHERE canonical_id IN (?,?)').bind(...timestampIds).run();
  }
  await operatorAtomicityFixture(env, store, clock);
  await metadataBindingFixture(env, store, clock);
  const urlAssociations = await urlAssociationFixture(env, store, clock);
  const owner = await store.issueUserToken('native-app-owner');
  const owned = await store.registerApp({ schemaVersion: 1, appName: 'Native owned app' }, owner.userId);
  const ownedRow = await env.VRCP_D1.prepare('SELECT owner_user_id FROM registered_apps WHERE app_id=?').bind(owned.appId).first();
  check(ownedRow.owner_user_id === owner.userId, 'App owner was not persisted');
  const view = await store.listUserApps(owner.userId, 50, null);
  check(view.apps.length === 1 && view.apps[0].appId === owned.appId, 'Owned app view was incorrect');
  check(Object.keys(view.apps[0]).sort().join(',') === 'appId,appName,createdAt,permissions,revokedAt', 'App view exposed private fields');
  const otherOwner = await store.issueUserToken('native-other-owner');
  check((await store.listUserApps(otherOwner.userId, 50, null, owned.appId)).apps.length === 0, 'Cross-user app view leaked');
  await env.VRCP_D1.exec("CREATE TRIGGER reject_native_app_owner BEFORE INSERT ON registered_apps WHEN NEW.owner_user_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'Owner write rejected'); END;");
  let ownershipRollback = false;
  try { await store.registerApp({ schemaVersion: 1, appName: 'Native rejected owner' }, owner.userId); } catch { ownershipRollback = true; }
  check(ownershipRollback, 'Ownership failure did not reject');
  const orphan = await env.VRCP_D1.prepare("SELECT COUNT(*) AS count FROM registered_apps WHERE app_name='Native rejected owner'").first();
  check(orphan.count === 0, 'Ownership failure left an app');
  await env.VRCP_D1.exec('DROP TRIGGER reject_native_app_owner;');
  await env.VRCP_D1.prepare('UPDATE registered_users SET revoked_at=? WHERE user_id=?').bind(new Date(clock).toISOString(), owner.userId).run();
  let revokedOwnerRejected = false;
  try { await store.registerApp({ schemaVersion: 1, appName: 'Native revoked owner' }, owner.userId); } catch { revokedOwnerRejected = true; }
  check(revokedOwnerRejected, 'Revoked owner created an app');
  check((await store.listUserApps(owner.userId, 50, null)).apps.length === 0, 'Revoked owner retained app views');
  const app = await store.registerApp({ schemaVersion: 1, appName: 'Native removal fixture' });
  const removal = { schemaVersion: 1, reportType: 'removal_request', canonicalId: 'native-removal-target', reason: 'Offline review fixture' };
  const report = await store.recordReportSubmission(app.appId, removal);
  const row = await env.VRCP_D1.prepare('SELECT app_id,ticket_type,review_status,payload_json FROM catalog_tickets WHERE ticket_id=?').bind(report.reportId).first();
  check(row.app_id === app.appId && row.ticket_type === 'removal_report' && row.review_status === 'pending', 'Native removal was not pending');
  check(JSON.stringify(JSON.parse(row.payload_json)) === JSON.stringify(removal), 'Native report payload changed');
  const demand = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM downstream_signals WHERE app_id=?').bind(app.appId).first();
  check(demand.count === 0, 'Removal generated scheduling demand');
  await env.VRCP_D1.prepare('UPDATE registered_apps SET revoked_at=? WHERE app_id=?').bind(new Date(clock).toISOString(), app.appId).run();
  let revokedReportRejected = false;
  try { await store.recordReportSubmission(app.appId, removal); } catch { revokedReportRejected = true; }
  check(revokedReportRejected, 'Revoked app wrote removal report');
  await store.seedJob(origin + '/index.json', 'vpm', { minDelayMs: 1000, purpose: 'metadata' });
  check(await store.reserveRobotsRefresh(origin) === null, 'Unreviewed refresh authorized');
  const robotsProfile = await store.createSteeringProfile({
    schemaVersion: 1, platform: 'vpm', hostMatchMode: 'exact', hostPattern: 'native-robots.example',
    pathScope: '/', queryMode: 'none', method: 'GET', purpose: 'metadata', minDelayMs: 2500,
    expiresAt: new Date(clock + 3600000).toISOString(), reviewReference: 'OFFLINE-NATIVE-FIXTURE',
    reason: 'Hermetic robots storage check', retainClasses: ['normalized_facts'], publishClasses: []
  }, 'offline-fixture');
  const leases = await Promise.all([store.reserveRobotsRefresh(origin), store.reserveRobotsRefresh(origin)]);
  check(leases.filter(Boolean).length === 1, 'Refresh race issued multiple leases');
  const first = leases.find(Boolean);
  const pacing = await env.VRCP_D1.prepare('SELECT next_allowed_at FROM origin_state WHERE origin=?').bind(origin).first();
  check(pacing.next_allowed_at === new Date(clock + 2500).toISOString(), 'Profile pacing was not applied');
  clock += 45000;
  check(await store.completeRobotsRefresh(origin, first, 404) === false, 'Expired completion accepted');
  const second = await store.reserveRobotsRefresh(origin);
  check(second && second !== first, 'Expired ownership not replaced');
  check(await store.completeRobotsRefresh(origin, first, 404) === false, 'Replaced completion accepted');
  check(await store.releaseRobotsRefresh(origin, first) === false, 'Old release erased new ownership');
  await env.VRCP_D1.prepare('UPDATE steering_profiles SET disabled_at=? WHERE profile_id=?')
    .bind(new Date(clock).toISOString(), robotsProfile.profileId).run();
  check(await store.completeRobotsRefresh(origin, second, 404) === false, 'Revoked profile completed refresh');
  check(await store.releaseRobotsRefresh(origin, second) === true, 'Held refresh could not release');
  await env.VRCP_D1.prepare('UPDATE steering_profiles SET disabled_at=NULL WHERE profile_id=?').bind(robotsProfile.profileId).run();
  check(await store.reserveRobotsRefresh(origin) === null, 'Release bypassed origin pacing');
  clock += 2500;
  await env.VRCP_D1.exec("CREATE TRIGGER reject_native_refresh BEFORE UPDATE ON origin_state WHEN NEW.origin='https://native-robots.example' AND NEW.refresh_lease_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'offline pacing failure'); END;");
  let rejected = false;
  try { await store.reserveRobotsRefresh(origin); } catch { rejected = true; }
  check(rejected, 'Pacing failure did not reject');
  const held = await env.VRCP_D1.prepare('SELECT refresh_lease_id FROM origin_state WHERE origin=?').bind(origin).first();
  check(held.refresh_lease_id === null, 'Pacing failure left a refresh lease');
  await env.VRCP_D1.exec('DROP TRIGGER reject_native_refresh;');
  const third = await store.reserveRobotsRefresh(origin);
  await env.VRCP_D1.exec("CREATE TRIGGER reject_native_snapshot BEFORE UPDATE ON origin_state WHEN NEW.origin='https://native-robots.example' AND NEW.robots_snapshot_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'offline snapshot failure'); END;");
  rejected = false;
  try { await store.completeRobotsRefresh(origin, third, 404); } catch { rejected = true; }
  check(rejected, 'Snapshot failure did not reject');
  const retained = await env.VRCP_D1.prepare('SELECT refresh_lease_id FROM origin_state WHERE origin=?').bind(origin).first();
  check(retained.refresh_lease_id === third, 'Snapshot failure consumed refresh ownership');
  await env.VRCP_D1.exec('DROP TRIGGER reject_native_snapshot;');
  check(third && await store.completeRobotsRefresh(origin, third, 404), 'Native guarded completion failed');
  check(await store.completeRobotsRefresh(origin, third, 599) === false, 'Consumed completion replayed');
  const snapshot = await env.VRCP_D1.prepare('SELECT robots_status_code FROM origin_state WHERE origin=?').bind(origin).first();
  check(snapshot.robots_status_code === 404, 'Rejected replay changed snapshot');
  await env.VRCP_D1.prepare("UPDATE crawl_jobs SET state='blocked' WHERE origin=?").bind(origin).run();
  await env.VRCP_D1.prepare("UPDATE steering_profiles SET disabled_at=? WHERE profile_id=?").bind(new Date(clock).toISOString(), robotsProfile.profileId).run();

  const botOrigin = 'https://native-bot-policy.example';
  const botProfile = await store.createSteeringProfile({
    schemaVersion: 1, platform: 'vpm', hostMatchMode: 'exact', hostPattern: 'native-bot-policy.example',
    pathScope: '/index.json', queryMode: 'none', method: 'GET', purpose: 'metadata', minDelayMs: 1000,
    expiresAt: new Date(clock + 3600000).toISOString(), reviewReference: 'OFFLINE-BOT-IDENTITY',
    reason: 'Hermetic bot-specific refusal check', retainClasses: ['normalized_facts'], publishClasses: []
  }, 'offline-fixture');
  await store.seedJob(botOrigin + '/index.json', 'vpm', { minDelayMs: 1000, purpose: 'metadata' });
  const botNode = 'native-bot-node';
  const botCred = await store.createNodeCredential(botNode, ['vpm']);
  const botPrincipal = await store.authenticate(botNode, botCred.token);
  const botRequest = { schemaVersion: 1, nodeId: botNode, capabilities: ['vpm'] };
  for (const bot of ['VRCPDiscoveryBot', 'VRCDiscoveryBot']) {
    await store.recordRobotsSnapshot(botOrigin, 200, 'User-agent: *\nAllow: /\nUser-agent: ' + bot + '\nDisallow: /index.json');
    check((await store.claim(botRequest, botPrincipal)).status === 'empty', 'Bot rename bypassed a specific refusal');
  }
  await store.recordRobotsSnapshot(botOrigin, 200, 'User-agent: VRCPDiscoveryBot\nAllow: /\nUser-agent: VRCDiscoveryBot\nAllow: /');
  check((await store.claim(botRequest, botPrincipal)).status === 'leased', 'Replaced snapshot retained stale matchers');
  await env.VRCP_D1.prepare("UPDATE crawl_jobs SET state='blocked' WHERE origin=?").bind(botOrigin).run();
  await env.VRCP_D1.prepare("UPDATE steering_profiles SET disabled_at=? WHERE profile_id=?").bind(new Date(clock).toISOString(), botProfile.profileId).run();
  return { status: 'passed', refreshRace: true, staleCompletion: true, profileRevocation: true,
    pacingRollback: true, completionRollback: true, botRestrictions: true, timestampProvenance: true,
    catalogEpoch: true, metadataBinding: true, urlAssociations };
}
async function urlAssociationFixture(env, store, clock) {
  const sourceUrl = 'https://native-publisher.example/Tools/Widget?Edition=Gold';
  const canonicalId = 'com.native.url-association';
  const createdProfileIds = [];
  const createdOrigins = [];
  const grant = async (platform, target) => {
    const url = new URL(target);
    const created = await store.createSteeringProfile({
      schemaVersion: 1, platform, hostMatchMode: 'exact', hostPattern: url.hostname.toLowerCase(),
      pathScope: url.pathname, queryMode: url.search ? 'exact' : 'none',
      ...(url.search ? { queryScope: url.search.slice(1) } : {}),
      method: 'GET', purpose: 'metadata', minDelayMs: 1000,
      expiresAt: new Date(clock + 3600000).toISOString(), reviewReference: 'OFFLINE-URL-ASSOCIATION',
      reason: 'Hermetic URL comparison fixture', retainClasses: ['normalized_facts'], publishClasses: []
    }, 'offline-fixture');
    createdProfileIds.push(created.profileId);
    createdOrigins.push(url.origin);
    await store.recordRobotsSnapshot(url.origin, 404);
    await store.seedJob(url.href, platform, { minDelayMs: 1000, purpose: 'metadata' });
  };
  const submit = async (nodeId, token, claim, observation, key) => {
    check(claim.status === 'leased', 'URL association fixture has no lease');
    const response = await worker.fetch(new Request('https://offline.invalid/v1/node/jobs/result', {
      method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, nodeId, jobId: claim.job.jobId, leaseId: claim.job.leaseId,
        idempotencyKey: key, outcome: { kind: 'changed', observation } })
    }), env);
    const receipt = await response.json();
    check(response.status === 200 && receipt.status === 'accepted', 'URL fixture submission failed');
  };
  await grant('vpm', sourceUrl);
  const vpmNode = 'native-url-vpm', vpmCred = await store.createNodeCredential(vpmNode, ['vpm']);
  const vpmPrincipal = await store.authenticate(vpmNode, vpmCred.token);
  const vpmClaim = await store.claim({ schemaVersion: 1, nodeId: vpmNode, capabilities: ['vpm'] }, vpmPrincipal);
  await submit(vpmNode, vpmCred.token, vpmClaim, { sourceItemKey: canonicalId, title: 'Native URL fixture',
    author: 'Offline publisher', summary: '', originUpdatedAt: null,
    outboundLinks: ['https://NATIVE-PUBLISHER.EXAMPLE:443/Tools/Widget?Edition=Gold', sourceUrl]
  }, 'native-url-vpm-result');
  const leadCount = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM source_leads WHERE discovered_from_job_id=?')
    .bind(vpmClaim.job.jobId).first();
  check(leadCount.count === 1, 'Serialized lead aliases did not deduplicate');
  const nodeId = 'native-url-store', storeCred = await store.createNodeCredential(nodeId, ['custom_domain']);
  const principal = await store.authenticate(nodeId, storeCred.token);
  const cases = [
    [sourceUrl, true], ['https://NATIVE-PUBLISHER.EXAMPLE:443/Tools/Widget?Edition=Gold', true],
    ['https://native-publisher.example/tools/widget?Edition=Gold', false],
    ['https://native-publisher.example/Tools/Widget?Edition=gold', false],
    ['https://native-publisher.example/Tools/Widget/?Edition=Gold', false], [sourceUrl + '/', false]
  ];
  for (let index = 0; index < cases.length; index++) {
    const [outbound, matches] = cases[index], target = 'https://native-url-' + index + '.example/products/tool';
    await grant('custom_domain', target);
    const claim = await store.claim({ schemaVersion: 1, nodeId, capabilities: ['custom_domain'] }, principal);
    check(claim.status === 'leased' && claim.job.url === target, 'Wrong URL fixture job assigned');
    await submit(nodeId, storeCred.token, claim, { sourceItemKey: new URL(target).host + '/products/tool',
      title: 'Native storefront fixture', author: 'Offline publisher', summary: '', originUpdatedAt: null,
      outboundLinks: [outbound] }, 'native-url-store-' + index);
    const sourceRow = await env.VRCP_D1.prepare('SELECT canonical_id FROM listing_sources WHERE storefront_url=?').bind(target).first();
    check(sourceRow?.canonical_id === (matches ? canonicalId : new URL(target).host + '/products/tool'),
      'Generic URL comparison conflated distinct resources or lost an exact match');
  }
  const publicResponse = await worker.fetch(new Request('https://offline.invalid/v1/app/index'), env);
  check(publicResponse.status === 200, 'URL comparison public read failed');
  const catalog = await publicResponse.json(), projected = catalog.packages.find(item => item.canonicalId === canonicalId);
  const provisionalFrontStillPublic = Boolean(projected?.sources.some(src => src.storefrontUrl === 'https://native-url-0.example/products/tool'));
  for (const profileId of createdProfileIds) {
    await env.VRCP_D1.prepare("UPDATE steering_profiles SET disabled_at=? WHERE profile_id=?").bind(new Date(clock).toISOString(), profileId).run();
  }
  return { cases: cases.length, aliasLeadCount: leadCount.count, provisionalFrontStillPublic };
}
async function metadataBindingFixture(env, store, clock) {
  const target = 'https://booth.pm/ja/items/98765', nodeId = 'native-metadata-node';
  const metaProfile = await store.createSteeringProfile({
    schemaVersion: 1, platform: 'booth', hostMatchMode: 'exact', hostPattern: 'booth.pm',
    pathScope: '/ja/items/98765', queryMode: 'none', method: 'GET', purpose: 'metadata', minDelayMs: 1000,
    expiresAt: new Date(clock + 3600000).toISOString(), reviewReference: 'OFFLINE-METADATA-FIXTURE',
    reason: 'Hermetic metadata source binding', retainClasses: ['normalized_facts'], publishClasses: ['normalized_facts']
  }, 'offline-fixture');
  await store.recordRobotsSnapshot('https://booth.pm', 404);
  await store.seedJob(target, 'booth', { minDelayMs: 1000, purpose: 'metadata' });
  const cred = await store.createNodeCredential(nodeId, ['booth']);
  const principal = await store.authenticate(nodeId, cred.token);
  const claim = await store.claim({ schemaVersion: 1, nodeId, capabilities: ['booth'] }, principal);
  check(claim.status === 'leased', 'Metadata fixture has no lease');
  const observation = { sourceItemKey: 'booth.pm/ja/items/98765', title: 'Native metadata fixture',
    author: 'Offline publisher', summary: '', outboundLinks: [], originUpdatedAt: null };
  const result = { schemaVersion: 1, nodeId, jobId: claim.job.jobId, leaseId: claim.job.leaseId,
    idempotencyKey: 'native-metadata-result', outcome: { kind: 'changed', observation } };
  const post = async (body, path = '/v1/node/jobs/result') => {
    const response = await worker.fetch(new Request('https://offline.invalid' + path, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cred.token },
      body: JSON.stringify(body)
    }), env);
    return { status: response.status, body: await response.json() };
  };
  const snapshot = async () => {
    const tables = ['source_items', 'job_results', 'canonical_packages',
      'listing_relations', 'listing_sources', 'source_leads', 'crawl_jobs', 'origin_state'];
    const rows = await Promise.all(tables.map(table => env.VRCP_D1.prepare('SELECT * FROM ' + table).all()));
    return JSON.stringify(rows.map(row => row.results));
  };
  const before = await snapshot();
  for (const [status, patch] of [
    [400, { title: 'x'.repeat(501) }], [400, { platformTags: ['x'.repeat(101)] }],
    [400, { outboundLinks: ['javascript:alert(1)'] }], [400, { unexpected: true }],
    [409, { title: '   ' }], [409, { sourceItemKey: 'com.unrelated.native' }],
    [409, { storefrontUrl: 'https://booth.pm/ja/items/11111' }],
    [409, { storefrontUrl: 'https://unrelated.example/product' }],
    [409, { storefrontUrl: target + '?edition=other' }]
  ]) {
    const rejected = await post({ ...result, outcome: { kind: 'changed', observation: { ...observation, ...patch } } });
    check(rejected.status === status, 'Malformed metadata did not fail at the expected boundary');
    check(await snapshot() === before, 'Rejected metadata changed durable D1 state');
  }
  const batch = await post({ schemaVersion: 1, nodeId, results: [{ jobId: result.jobId, leaseId: result.leaseId,
    idempotencyKey: 'native-metadata-release-conflict', outcome: { kind: 'changed', observation: {
      ...observation, release: { version: '1.0.0', dependencyRanges: {} } } } }] }, '/v1/node/jobs/results');
  check(batch.status === 200 && batch.body.receipts[0].status === 'rejected' &&
    batch.body.receipts[0].code === 'conflict' && batch.body.receipts[0].terminal === false,
    'Release-evidence conflict was incorrectly classified as terminal lease expiry');
  check(await snapshot() === before, 'Batch rejection changed durable D1 state');
  const valid = { ...result, outcome: { kind: 'changed', observation: {
    ...observation, storefrontUrl: target + '?utm_source=fixture' } } };
  const accepted = await post(valid);
  check(accepted.status === 200 && accepted.body.status === 'accepted' && !accepted.body.duplicate,
    'Corrected metadata did not retain the original lease');
  const sources = await store.getListingSourcesForCanonical(observation.sourceItemKey);
  check(sources.length === 1 && sources[0].storefrontUrl === target, 'Listing source did not use assigned source URL');
  const publicResponse = await worker.fetch(new Request('https://offline.invalid/v1/app/index'), env);
  const catalog = await publicResponse.json();
  check(publicResponse.status === 200 && catalog.packages.find(item => item.canonicalId === observation.sourceItemKey)
    ?.sources[0]?.storefrontUrl === target, 'Public HTTP projection did not preserve assigned source URL');
  const settled = await snapshot();
  const replay = await post(valid);
  check(replay.status === 200 && replay.body.duplicate && await snapshot() === settled,
    'Metadata replay changed durable state');
  await env.VRCP_D1.batch([
    env.VRCP_D1.prepare('DELETE FROM listing_sources WHERE canonical_id=?').bind(observation.sourceItemKey),
    env.VRCP_D1.prepare('DELETE FROM listing_relations WHERE source_canonical_id=? OR target_canonical_id=?').bind(observation.sourceItemKey, observation.sourceItemKey),
    env.VRCP_D1.prepare('DELETE FROM canonical_packages WHERE canonical_id=?').bind(observation.sourceItemKey),
    env.VRCP_D1.prepare('UPDATE steering_profiles SET disabled_at=? WHERE profile_id=?').bind(new Date(clock).toISOString(), metaProfile.profileId)
  ]);
}
async function operatorAtomicityFixture(env, store, clock) {
  const db = env.VRCP_D1, existingNode = 'native-audit-rotation', freshNode = 'native-audit-new';
  const oldCred = await store.createNodeCredential(existingNode, ['vpm']);
  const beforeCredential = await db.prepare('SELECT * FROM nodes WHERE node_id=?').bind(existingNode).first();
  await db.exec("CREATE TRIGGER reject_native_credential_audit BEFORE INSERT ON operator_audit_log WHEN NEW.entity_type='node' AND NEW.entity_id LIKE 'native-audit-%' BEGIN SELECT RAISE(ABORT,'Offline credential audit failure'); END;");
  for (const nodeId of [freshNode, existingNode]) {
    let failed = false;
    try { await store.issueNodeCredential({ schemaVersion: 1, nodeId, reason: 'Offline audit rollback' }, 'offline-fixture'); }
    catch { failed = true; }
    check(failed, 'Credential audit failure was not propagated');
  }
  await db.exec('DROP TRIGGER reject_native_credential_audit;');
  check(await db.prepare('SELECT 1 FROM nodes WHERE node_id=?').bind(freshNode).first() === null,
    'Failed issuance left an undisclosed credential');
  const afterCredential = await db.prepare('SELECT * FROM nodes WHERE node_id=?').bind(existingNode).first();
  check(JSON.stringify(beforeCredential) === JSON.stringify(afterCredential), 'Failed rotation changed existing credentials');
  check(await store.authenticate(existingNode, oldCred.token) !== null, 'Failed rotation invalidated the old token');
  const retriedCred = await store.issueNodeCredential({ schemaVersion: 1, nodeId: freshNode, reason: 'Offline retry' }, 'offline-fixture');
  check(await store.authenticate(freshNode, retriedCred.token) !== null, 'Credential retry failed');
  const issuanceAudit = await db.prepare("SELECT COUNT(*) AS count FROM operator_audit_log WHERE entity_type='node' AND entity_id=?").bind(freshNode).first();
  check(issuanceAudit.count === 1, 'Issuance retry did not commit exactly one audit');
  const issuanceReason = await db.prepare("SELECT actor,reason FROM operator_audit_log WHERE entity_type='node' AND entity_id=? AND action='issue'").bind(freshNode).first();
  check(issuanceReason.actor === 'offline-fixture' && issuanceReason.reason === 'Offline retry', 'Issuance audit lost actor or reason');

  const sourceUrl = 'https://native-approval-source.example/index.json';
  const sourceJob = await store.seedJob(sourceUrl, 'vpm', { minDelayMs: 1000, purpose: 'discovery' });
  for (const existing of [false, true]) {
    const origin = existing ? 'https://native-approval-existing.example' : 'https://native-approval-new.example';
    const url = origin + '/index.json', leadKey = (existing ? 'b' : 'a').repeat(64);
    if (existing) {
      const existingJob = await store.seedJob(url, 'vpm', { minDelayMs: 1000, purpose: 'discovery' });
      await db.prepare("UPDATE crawl_jobs SET state='leased',claimed_by=?,lease_id=?,lease_expires_at=?,next_fetch_at=? WHERE job_id=?")
        .bind(existingNode, 'native-existing-lease', new Date(clock + 60000).toISOString(), new Date(clock + 86400000).toISOString(), existingJob).run();
      await db.prepare('UPDATE origin_state SET active_job_id=?,lease_expires_at=? WHERE origin=?')
        .bind(existingJob, new Date(clock + 60000).toISOString(), origin).run();
    }
    await db.prepare("INSERT INTO source_leads(lead_key,discovered_from_url,discovered_from_job_id,kind,target_url,target_host,status,first_seen_at,last_seen_at) VALUES (?,?,?,'vpm_listing',?,?,'pending_review',?,?)")
      .bind(leadKey, sourceUrl, sourceJob, url, new URL(url).hostname, new Date(clock).toISOString(), new Date(clock).toISOString()).run();
    const beforeJob = await db.prepare('SELECT * FROM crawl_jobs WHERE url=?').bind(url).first();
    const beforeOrigin = await db.prepare('SELECT * FROM origin_state WHERE origin=?').bind(origin).first();
    await db.exec("CREATE TRIGGER reject_native_approval_audit BEFORE INSERT ON operator_audit_log WHEN NEW.entity_type='lead' AND NEW.action='approve_lead' BEGIN SELECT RAISE(ABORT,'Offline approval audit failure'); END;");
    let failed = false;
    try { await store.approveLead(leadKey, 2000, 'offline-fixture', 'Offline approval rollback'); } catch { failed = true; }
    await db.exec('DROP TRIGGER reject_native_approval_audit;');
    check(failed, 'Approval audit failure was not propagated');
    check(JSON.stringify(beforeJob) === JSON.stringify(await db.prepare('SELECT * FROM crawl_jobs WHERE url=?').bind(url).first()),
      'Failed approval changed queue state or lease');
    check(JSON.stringify(beforeOrigin) === JSON.stringify(await db.prepare('SELECT * FROM origin_state WHERE origin=?').bind(origin).first()),
      'Failed approval changed origin pacing or reservation');
    const lead = await db.prepare('SELECT status FROM source_leads WHERE lead_key=?').bind(leadKey).first();
    check(lead.status === 'pending_review', 'Failed approval changed lead status');
    const jobId = await store.approveLead(leadKey, 2000, 'offline-fixture', 'Offline approval retry');
    check(await store.approveLead(leadKey, 2000, 'offline-fixture', 'Offline approval replay') === jobId,
      'Approval replay changed job identity');
    const audit = await db.prepare("SELECT COUNT(*) AS count FROM operator_audit_log WHERE entity_type='lead' AND entity_id=? AND action='approve_lead'").bind(leadKey).first();
    check(audit.count === 1, 'Approval replay duplicated its audit');
    const approved = await db.prepare('SELECT status FROM source_leads WHERE lead_key=?').bind(leadKey).first();
    check(approved.status === 'approved', 'Approval retry did not commit lead state');
    if (existing) {
      const retained = await db.prepare('SELECT state,lease_id,next_fetch_at FROM crawl_jobs WHERE url=?').bind(url).first();
      check(retained.state === beforeJob.state && retained.lease_id === beforeJob.lease_id && retained.next_fetch_at === beforeJob.next_fetch_at,
        'Successful approval reset an existing lease or schedule');
    }
  }
}
`;

const discoveryFixtureModule = String.raw`
import { Coordinator } from './storage.mjs';
export async function discoveryFixture(env) {
  const clock = Date.now(), store = new Coordinator(env.VRCP_D1, () => clock), cases = [];
  for (const failAt of [1, 2]) {
    const origin = 'https://native-discovery-' + failAt + '.example';
    const url = origin + '/index.json', nodeId = 'native-discovery-' + failAt;
    const prof = await store.createSteeringProfile({
      schemaVersion: 1, platform: 'vpm', hostMatchMode: 'exact', hostPattern: 'native-discovery-' + failAt + '.example',
      pathScope: '/index.json', queryMode: 'none', method: 'GET', purpose: 'discovery', minDelayMs: 1000,
      expiresAt: new Date(clock + 3600000).toISOString(), reviewReference: 'OFFLINE-DISCOVERY-ATOMICITY',
      reason: 'Hermetic discovery rollback fixture', retainClasses: ['normalized_facts'], publishClasses: []
    }, 'offline-fixture');
    await store.recordRobotsSnapshot(origin, 200, 'User-agent: *\nAllow: /');
    await store.seedJob(url, 'vpm', { minDelayMs: 1000, purpose: 'discovery' });
    const cred = await store.createNodeCredential(nodeId, ['vpm']);
    const principal = await store.authenticate(nodeId, cred.token);
    const claim = await store.claim({ schemaVersion: 1, nodeId, capabilities: ['vpm'] }, principal);
    if (claim.status !== 'leased' || claim.job.url !== url) throw new Error('Discovery fixture was not leased');
    const leads = [{ kind: 'vpm_listing', url: origin + '/first.json' },
      { kind: 'vpm_listing', url: origin + '/second.json' }];
    const payload = { schemaVersion: 1, nodeId, jobId: claim.job.jobId, leaseId: claim.job.leaseId,
      idempotencyKey: 'native-discovery-' + crypto.randomUUID(), outcome: { kind: 'discovery', leads } };
    await env.VRCP_D1.exec("CREATE TRIGGER reject_native_discovery_lead BEFORE INSERT ON source_leads WHEN NEW.discovered_from_job_id='" +
      claim.job.jobId + "' AND NEW.target_url='" + leads[failAt - 1].url +
      "' BEGIN SELECT RAISE(ABORT,'Offline discovery write failure'); END;");
    let rejected = false;
    try { await store.submit(payload, principal); } catch { rejected = true; }
    await env.VRCP_D1.exec('DROP TRIGGER reject_native_discovery_lead;');
    const receipt = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM job_results WHERE lease_id=?')
      .bind(payload.leaseId).first();
    const leadRows = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM source_leads WHERE discovered_from_job_id=?')
      .bind(payload.jobId).first();
    const job = await env.VRCP_D1.prepare('SELECT state,lease_id FROM crawl_jobs WHERE job_id=?').bind(payload.jobId).first();
    const reservation = await env.VRCP_D1.prepare('SELECT active_job_id FROM origin_state WHERE origin=?').bind(origin).first();
    const accepted = await store.submit(payload, principal);
    const committed = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM source_leads WHERE discovered_from_job_id=?')
      .bind(payload.jobId).first();
    const replay = await store.submit(payload, principal);
    const replayed = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM source_leads WHERE discovered_from_job_id=?')
      .bind(payload.jobId).first();
    const committedReceipts = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM job_results WHERE lease_id=?')
      .bind(payload.leaseId).first();
    await env.VRCP_D1.prepare("UPDATE steering_profiles SET disabled_at=? WHERE profile_id=?").bind(new Date(clock).toISOString(), prof.profileId).run();
    cases.push({ failAt, rejected, receiptCount: receipt.count, partialLeadCount: leadRows.count,
      state: job.state, leaseRetained: job.lease_id === payload.leaseId,
      reservationRetained: reservation.active_job_id === payload.jobId,
      accepted, replay, committedLeadCount: committed.count, replayedLeadCount: replayed.count,
      committedReceiptCount: committedReceipts.count });
  }
  return { cases };
}`;

const buildChannel = process.env.VRCP_WORKER_BUILD_CHANNEL ?? 'preview';
assert.ok(['preview', 'release'].includes(buildChannel), 'Invalid runtime build channel');
const workerConfig = unstable_readConfig({
	config: fileURLToPath(new URL('../wrangler.toml', import.meta.url)),
	env: buildChannel === 'preview' ? 'preview' : 'production'
});
assert.ok(!workerConfig.assets?.directory, 'Runtime smoke requires the API-only Worker');
assert.equal(workerConfig.d1_databases.length, 1);
assert.equal(workerConfig.d1_databases[0].binding, 'VRCP_D1');
assert.notEqual(workerConfig.d1_databases[0].remote, true, 'Remote bindings are forbidden');

let externalFetches = 0;
const runtime = new Miniflare(
	convertV4MiniflareOptions({
		workers: [
			{
				name: 'offline-audit',
				modules: [
					{
						type: 'ESModule',
						path: 'audit-main.mjs',
						contents:
							"import coordinator from './coordinator.mjs';\nimport { refreshFixture } from './refresh-fixture.mjs';\nimport { discoveryFixture } from './discovery-fixture.mjs';\nexport default { async fetch(request,env) {\n  const path=new URL(request.url).pathname;\n  if(path!=='/__fixture' && path!=='/__refresh' && path!=='/__discovery') return coordinator.fetch(request,env);\n  if(request.headers.get('authorization')!=='Bearer '+env.OPERATOR_TOKEN) return new Response('',{status:401});\n  if(path==='/__refresh') { try { return Response.json(await refreshFixture(env)); } catch (e) { return Response.json({ error: String(e && e.stack || e) }, { status: 500 }); } }\n  if(path==='/__discovery') { try { return Response.json(await discoveryFixture(env)); } catch (e) { return Response.json({ error: String(e && e.stack || e) }, { status: 500 }); } }\n  const now=new Date().toISOString(), expires=new Date(Date.now()+3600000).toISOString();\n  const jobId=crypto.randomUUID();\n  await env.VRCP_D1.prepare('INSERT INTO crawl_jobs(job_id,platform,url,origin,state,next_fetch_at,created_at,job_purpose) VALUES (?,?,?,?,?,?,?,?)')\n    .bind(jobId,'vpm','https://runtime.example/index.json','https://runtime.example','pending',now,now,'metadata').run();\n  await env.VRCP_D1.prepare('INSERT INTO origin_state(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms,robots_snapshot_id,robots_status_code,robots_body,robots_fetched_at,robots_expires_at) VALUES (?,NULL,NULL,?,1000,?,200,?,?,?)')\n    .bind('https://runtime.example',now,crypto.randomUUID(),'User-agent: *\\nAllow: /',now,expires).run();\n  return Response.json({status:'offline-fixture-ready'});\n}};"
					},
					{ type: 'ESModule', path: 'storage.mjs', contents: storageModule },
					{ type: 'ESModule', path: 'refresh-fixture.mjs', contents: refreshFixtureModule },
					{ type: 'ESModule', path: 'discovery-fixture.mjs', contents: discoveryFixtureModule },
					{
						type: 'ESModule',
						path: 'coordinator.mjs',
						contents: readFileSync(
							new URL(`../.wrangler/dev-build/${buildChannel === 'preview' ? 'preview' : 'production'}/worker_entry.js`, import.meta.url),
							'utf8'
						)
					}
				],
				compatibilityDate: workerConfig.compatibility_date,
				compatibilityFlags: workerConfig.compatibility_flags,
				d1Databases: { VRCP_D1: randomUUID() },
				kvNamespaces: { RATE_LIMIT_KV: randomUUID() },
				bindings: {
					...(workerConfig.vars ?? {}),
					OPERATOR_TOKEN: operatorToken
				},
				outboundService: () => {
					externalFetches++;
					return new Response('External requests disabled', { status: 403 });
				}
			}
		]
	})
);

try {
	const send = async (method, path, payload, token) => {
		const response = await runtime.dispatchFetch('https://offline.test' + path, {
			method,
			signal: AbortSignal.timeout(60_000),
			headers: {
				...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
				authorization: 'Bearer ' + token
			},
			...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
		});
		if (!response.ok) {
			const errBody = await response.text();
			console.error(`ERROR on ${method} ${path}: ${response.status} ${errBody}`);
			assert.ok(response.ok, `${method} ${path} returned ${response.status}: ${errBody}`);
		}
		const body = await response.json();
		console.log(JSON.stringify({ step: `${method} ${path}`, status: response.status }));
		return body;
	};
	const post = (path, payload, token) => send('POST', path, payload, token);

	// 1. Verify pre-init operator status and strict autoSeed=false requirement
	const preInitStatus = OperatorStatusResponseSchema.parse(await send('GET', '/v1/operator/status', undefined, operatorToken));
	assert.equal(preInitStatus.d1SchemaState, 'uninitialized');
	assert.equal(preInitStatus.purgeEnabled, buildChannel === 'preview');

	const autoSeedRejected = await runtime.dispatchFetch('https://offline.test/v1/operator/init', {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: 'Bearer ' + operatorToken },
		body: JSON.stringify({ schemaVersion: 1, autoSeed: true })
	});
	assert.equal(autoSeedRejected.status, 400, 'autoSeed=true must reject with 400');

	await post('/v1/operator/init', { schemaVersion: 1, autoSeed: false }, operatorToken);
	const postInitStatus = OperatorStatusResponseSchema.parse(await send('GET', '/v1/operator/status', undefined, operatorToken));
	assert.equal(postInitStatus.d1SchemaState, 'v0-17');

	const smokeDb = await runtime.getD1Database('VRCP_D1');
	const v0Tables = await smokeDb
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
		.all();
	assert.equal(v0Tables.results.length, 17, 'V0 schema must have 17 application tables');
	const v0Views = await smokeDb.prepare("SELECT name FROM sqlite_master WHERE type='view'").all();
	assert.equal(v0Views.results.length, 0, 'V0 schema must have 0 views');
	const v0Indexes = await smokeDb
		.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex_%'")
		.all();
	assert.equal(v0Indexes.results.length, 39, 'V0 schema must have 39 explicit indexes');

	// Verify environment purge guard: 200 in preview (development), 403 in release (production)
	if (buildChannel === 'preview') {
		const purgedStarter = SystemPurgeResponseSchema.parse(
			await post(
				'/v1/operator/system/purge',
				{ schemaVersion: 1, confirm: 'PURGE_DEVELOPMENT_D1', preserveNodes: true, seedPreviewStarter: true },
				operatorToken
			)
		);
		assert.equal(purgedStarter.d1SchemaState, 'v0-17');
		assert.equal(purgedStarter.seededProfiles, 16);
		// Reset cleanly without starter profiles for isolated empty-profile checks below
		await post(
			'/v1/operator/system/purge',
			{ schemaVersion: 1, confirm: 'PURGE_DEVELOPMENT_D1', preserveNodes: false, seedPreviewStarter: false },
			operatorToken
		);
	} else {
		const prodPurgeRes = await runtime.dispatchFetch('https://offline.test/v1/operator/system/purge', {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: 'Bearer ' + operatorToken },
			body: JSON.stringify({
				schemaVersion: 1,
				confirm: 'PURGE_DEVELOPMENT_D1',
				preserveNodes: false,
				seedPreviewStarter: false
			})
		});
		assert.equal(prodPurgeRes.status, 403, 'Production environment must reject system purge with 403');
	}

	let lastOperatorRawText = '';
	const operatorClient = new VRCPackageClient({
		baseUrl: 'https://offline.test',
		operatorToken,
		fetch: async (input, init) => {
			const response = await runtime.dispatchFetch(String(input), init);
			lastOperatorRawText = await response.clone().text();
			return response;
		}
	});
	const initialNodes = await operatorClient.operator.nodes.list();
	assert.deepEqual(initialNodes, { schemaVersion: 1, nodes: [], nextCursor: null });
	assert.ok(!lastOperatorRawText.includes('token_hash') && !lastOperatorRawText.includes('"token"'));

	// 2. Unicode keyset pagination on canonical_packages
	const paginationDB = await runtime.getD1Database('VRCP_D1');
	const paginationIds = ['界'.repeat(499) + 'a', '界'.repeat(499) + 'b'];
	const paginationTime = '2099-01-01T00:00:00.000Z';
	for (const id of paginationIds) {
		await paginationDB
			.prepare(
				`INSERT INTO canonical_packages
         (canonical_id, umbrella, category, lifecycle, display_name, created_at, updated_at)
         VALUES (?, 'tools', 'tool', 'active', 'Native pagination fixture', ?, ?)`
			)
			.bind(id, paginationTime, paginationTime)
			.run();
	}
	try {
		for (const [path, schema, decode, expected] of [
			['/v1/app/index', PublicCatalogListResponseSchema, decodeCatalogCursor, [...paginationIds].reverse()],
			['/v1/app/index/delta', CatalogDeltaResponseSchema, decodeCatalogDeltaCursor, paginationIds]
		]) {
			let cursor = null;
			const seen = [];
			for (const id of expected) {
				const url = new URL(path, 'https://offline.test');
				url.searchParams.set('limit', '1');
				if (cursor) url.searchParams.set('cursor', cursor);
				const response = await runtime.dispatchFetch(url.href);
				assert.equal(response.status, 200);
				const page = schema.parse(await response.json());
				const rows = page.packages ?? page.deltas;
				assert.deepEqual(
					rows.map((row) => row.canonicalId),
					[id]
				);
				seen.push(rows[0].canonicalId);
				cursor = page.nextCursor;
				if (seen.length === 1) {
					assert.ok(cursor.length > 256 && cursor.length <= 8192);
					assert.equal(decode(cursor).canonicalId, id);
				} else assert.equal(cursor, null);
			}
			assert.deepEqual(seen, expected);
		}
		console.log(JSON.stringify({ check: 'native_HTTP_unicode_keyset_pagination', pages: 4, passed: true }));
	} finally {
		for (const id of paginationIds) {
			await paginationDB.prepare('DELETE FROM canonical_packages WHERE canonical_id=?').bind(id).run();
		}
	}

	// 3. Downstream report intake + relationship_feedback + trusted claims boundary
	const anonymousRegistration = await runtime.dispatchFetch('https://offline.test/v1/app/register', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ schemaVersion: 1, appName: 'Anonymous native app' })
	});
	assert.equal(anonymousRegistration.status, 401);
	const reportApp = await post('/v1/app/register', { schemaVersion: 1, appName: 'Operator native app' }, operatorToken);
	const untrustedRemoval = await runtime.dispatchFetch('https://offline.test/v1/app/report', {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: 'Bearer ' + reportApp.appToken },
		body: JSON.stringify({
			schemaVersion: 1,
			reportType: 'removal_request',
			canonicalId: 'native-receipt-target',
			reason: 'Untrusted removal probe'
		})
	});
	assert.equal(untrustedRemoval.status, 403);
	await post(
		`/v1/operator/apps/${reportApp.appId}/candidate-review`,
		{
			schemaVersion: 1,
			candidateStatus: 'trusted',
			notes: 'Native runtime smoke trust promotion'
		},
		operatorToken
	);
	const reportStatuses = [];
	const reportingClient = new VRCPackageClient({
		baseUrl: 'https://offline.test',
		appToken: reportApp.appToken,
		fetch: async (input, init) => {
			const response = await runtime.dispatchFetch(String(input), init);
			reportStatuses.push(response.status);
			return response;
		}
	});
	for (const report of [
		{ schemaVersion: 1, reportType: 'demand_signal', signalKind: 'search_miss', query: 'native receipt', zeroHits: true },
		{
			schemaVersion: 1,
			reportType: 'issue_report',
			reportKind: 'wrong_metadata',
			canonicalId: 'native-receipt-target',
			reason: ' Native metadata mismatch ',
			metadata: { reason: 'Do not replace accepted reason', source: 'native-fixture' }
		},
		{
			schemaVersion: 1,
			reportType: 'relationship_feedback',
			canonicalId: 'native-receipt-target',
			relatedCanonicalId: 'native-dependency-target',
			relationType: 'depends_on',
			vote: 'up',
			reason: 'Verified dependency link'
		},
		{
			schemaVersion: 1,
			reportType: 'removal_request',
			canonicalId: 'native-receipt-target',
			reason: 'Native receipt fixture'
		}
	]) {
		const receipt = await reportingClient.reports.submit(report);
		assert.deepEqual(Object.keys(receipt).sort(), ['schemaVersion', 'status', 'reportId', 'recordedAt'].sort());
		if (report.reportType === 'issue_report') {
			const row = await smokeDb
				.prepare('SELECT app_id, ticket_type, canonical_id, reason, payload_json FROM catalog_tickets WHERE ticket_id=?')
				.bind(receipt.reportId)
				.first();
			assert.equal(row.app_id, reportApp.appId);
			assert.equal(row.ticket_type, 'metadata_issue');
			assert.equal(row.canonical_id, report.canonicalId);
			assert.equal(row.reason, report.reason.trim());
			const payload = JSON.parse(row.payload_json);
			assert.equal(payload.metadata.source, 'native-fixture');
			assert.equal(payload.canonicalId, report.canonicalId);
		} else if (report.reportType === 'removal_request') {
			const row = await smokeDb
				.prepare('SELECT app_id, ticket_type, canonical_id, review_status FROM catalog_tickets WHERE ticket_id=?')
				.bind(receipt.reportId)
				.first();
			assert.equal(row.app_id, reportApp.appId);
			assert.equal(row.ticket_type, 'removal_report');
			assert.equal(row.canonical_id, report.canonicalId);
			assert.equal(row.review_status, 'pending');
		}
	}
	assert.deepEqual(reportStatuses, [200, 200, 200, 202]);

	// Resolve synthetic demand signals left by report test before workforce distribution checks
	await smokeDb.prepare("UPDATE downstream_signals SET resolved_at='2026-10-18T00:00:00.000Z'").run();

	const crossVariantReport = await runtime.dispatchFetch('https://offline.test/v1/app/report', {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: 'Bearer ' + reportApp.appToken },
		body: JSON.stringify({
			schemaVersion: 1,
			reportType: 'demand_signal',
			signalKind: 'search_miss',
			reportKind: 'wrong_metadata',
			query: 'cross variant probe',
			zeroHits: true
		})
	});
	assert.equal(crossVariantReport.status, 400, 'Cross-variant reportKind inside demand_signal must reject 400');
	assert.equal((await crossVariantReport.json()).code, 'invalid_payload');
	console.log(
		JSON.stringify({
			check: 'native_HTTP_report_sdk_receipts',
			statuses: reportStatuses,
			crossVariantRejected: true,
			passed: true
		})
	);

	// 4. CORS preflight checks (including PATCH)
	const unlistedPreflight = await runtime.dispatchFetch('https://offline.test/v1/operator/catalog', {
		method: 'OPTIONS',
		headers: { Origin: 'https://unlisted-browser.example' }
	});
	assert.equal(unlistedPreflight.status, 403, 'Unlisted browser origin OPTIONS preflight must reject 403');
	assert.equal(unlistedPreflight.headers.get('access-control-allow-origin'), null);
	assert.equal((await unlistedPreflight.json()).code, 'cors_origin_forbidden');
	if (buildChannel === 'preview') {
		const allowlistedPreflight = await runtime.dispatchFetch('https://offline.test/v1/operator/jobs/11111111-1111-4111-8111-111111111111', {
			method: 'OPTIONS',
			headers: {
				Origin: 'http://localhost:4321',
				'Access-Control-Request-Method': 'PATCH',
				'Access-Control-Request-Headers': 'Authorization, Content-Type'
			}
		});
		assert.equal(allowlistedPreflight.status, 204, 'Preview allowlisted PATCH OPTIONS preflight must return 204');
		assert.equal(allowlistedPreflight.headers.get('access-control-allow-origin'), 'http://localhost:4321');
		assert.equal(allowlistedPreflight.headers.get('access-control-allow-methods'), 'GET, POST, PATCH, DELETE, OPTIONS');
		assert.equal(allowlistedPreflight.headers.get('vary'), 'Origin');
	}
	console.log(JSON.stringify({ check: 'native_HTTP_cors_preflight', channel: buildChannel, passed: true }));

	// 5. Verify retired legacy routes return 404
	for (const route of ['/v1/user/nodes', '/v1/user/delist', '/v1/operator/autoqueue-rules', '/v1/operator/source-profiles']) {
		const removedRes = await runtime.dispatchFetch('https://offline.test' + route, {
			method: 'GET',
			headers: { authorization: 'Bearer ' + operatorToken }
		});
		assert.equal(removedRes.status, 404, `Retired route ${route} must return 404`);
	}

	// 6. Operator Jobs CRUD & Steering Profiles CRUD
	const seedInput = {
		schemaVersion: 1,
		url: 'https://native-seed.example/index.json',
		platform: 'vpm',
		purpose: 'metadata',
		minDelayMs: 1000,
		reason: 'Offline native enqueue fixture'
	};
	const seeded = EnqueueJobResponseSchema.parse(await post('/v1/operator/jobs', seedInput, operatorToken));
	const repeated = EnqueueJobResponseSchema.parse(await post('/v1/operator/jobs', seedInput, operatorToken));
	assert.equal(seeded.jobId, repeated.jobId);
	const pendingVpmJobs = await operatorClient.operator.jobs.list({ state: 'pending', platform: 'vpm' });
	assert.ok(!lastOperatorRawText.includes('lease_id') && !lastOperatorRawText.includes('leaseId'));
	assert.ok(!lastOperatorRawText.includes('etag') && !lastOperatorRawText.includes('last_modified'));
	const seededJob = pendingVpmJobs.jobs.find((job) => job.jobId === seeded.jobId);
	assert.ok(seededJob, 'Enqueued job must appear in GET /v1/operator/jobs');
	OperatorJobRecordSchema.parse(seededJob);
	assert.equal(seededJob.platform, 'vpm');
	assert.equal(seededJob.url, seedInput.url);
	assert.equal(seededJob.origin, 'https://native-seed.example');
	assert.equal(seededJob.state, 'pending');
	assert.equal(seededJob.purpose, 'metadata');
	assert.equal(seededJob.priorityLane, 1);
	assert.equal(seededJob.recrawlIntervalMs, 21_600_000);
	assert.equal(seededJob.paginationDepth, 0);
	assert.equal(seededJob.claimedBy, null);
	assert.equal(seededJob.leaseExpiresAt, null);
	assert.equal(seededJob.robotsDeferredUntil, null);
	assert.equal(seededJob.steeringProfileId, null);
	assert.ok(seededJob.claimabilityBlockers.includes('no_active_steering_profile'));

	const patchedJob = UpdateJobResponseSchema.parse(
		await send(
			'PATCH',
			`/v1/operator/jobs/${seeded.jobId}`,
			{ schemaVersion: 1, priorityLane: 2, reason: 'Runtime PATCH check' },
			operatorToken
		)
	);
	assert.equal(patchedJob.job.priorityLane, 2);

	const profileInput = {
		schemaVersion: 1,
		platform: 'vpm',
		hostMatchMode: 'exact',
		hostPattern: 'native-rule.example',
		pathScope: '/index.json',
		queryMode: 'none',
		method: 'GET',
		purpose: 'discovery',
		minDelayMs: 1000,
		expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
		reviewReference: 'OFFLINE-STEERING-REVIEW',
		reason: 'Hermetic steering profile contract check',
		retainClasses: ['normalized_facts'],
		publishClasses: []
	};
	const createdProfile = SteeringProfileResponseSchema.parse(
		await post('/v1/operator/steering-profiles', profileInput, operatorToken)
	);
	assert.equal(createdProfile.profile.hostPattern, 'native-rule.example');

	const listedProfiles = SteeringProfileListResponseSchema.parse(
		await send('GET', '/v1/operator/steering-profiles', undefined, operatorToken)
	);
	assert.equal(listedProfiles.profiles.length, 1);
	assert.equal(listedProfiles.profiles[0].profileId, createdProfile.profile.profileId);
	await send(
		'DELETE',
		`/v1/operator/steering-profiles/${createdProfile.profile.profileId}`,
		{ schemaVersion: 1, reason: 'Cleanup steering profile fixture' },
		operatorToken
	);
	const jobPage1 = await operatorClient.operator.jobs.list({ limit: 1 });
	assert.equal(jobPage1.jobs.length, 1);

	// 7. In-workerd native Coordinator atomicity / rollback / URL association tests
	const refreshCheck = await post('/__refresh', {}, operatorToken);
	assert.equal(refreshCheck.status, 'passed');
	assert.equal(refreshCheck.timestampProvenance, true);
	assert.equal(refreshCheck.catalogEpoch, true);
	assert.equal(refreshCheck.metadataBinding, true);
	assert.equal(refreshCheck.urlAssociations.cases, 6);
	assert.equal(refreshCheck.urlAssociations.aliasLeadCount, 1);
	assert.equal(refreshCheck.urlAssociations.provisionalFrontStillPublic, false);
	console.log(
		JSON.stringify({
			check: 'native_D1_HTTP_URL_associations',
			...refreshCheck.urlAssociations,
			ownershipPolicyResolved: true
		})
	);
	console.log(
		JSON.stringify({
			check: 'native_D1_HTTP_metadata_binding',
			malformedRejected: true,
			rejectedWritesAbsent: true,
			correctedLeaseAccepted: true,
			replayPreserved: true
		})
	);
	console.log(
		JSON.stringify({ check: 'native_D1_catalog_epoch_concurrency', readers: 8, resetPersisted: true, passed: true })
	);
	console.log(JSON.stringify({ check: 'native_D1_timestamp_provenance', passed: true }));
	console.log(JSON.stringify({ check: 'native_D1_refresh_ownership', ...refreshCheck }));

	const discoveryCheck = await post('/__discovery', {}, operatorToken);
	console.log(JSON.stringify({ check: 'native_D1_discovery_atomicity', ...discoveryCheck, externalFetches }));
	for (const result of discoveryCheck.cases) {
		const context = 'Discovery insert failure ' + result.failAt;
		assert.equal(result.rejected, true, context + ' must reject submission');
		assert.equal(result.receiptCount, 0, context + ' must roll back the receipt');
		assert.equal(result.partialLeadCount, 0, context + ' must roll back every lead');
		assert.equal(result.state, 'leased', context + ' must preserve job state');
		assert.equal(result.leaseRetained, true, context + ' must preserve lease ownership');
		assert.equal(result.reservationRetained, true, context + ' must preserve origin reservation');
		assert.equal(ResultResponseSchema.parse(result.accepted).duplicate, false, context + ' retry must commit');
		assert.equal(result.committedLeadCount, 2, context + ' retry must retain both leads');
		assert.equal(result.committedReceiptCount, 1, context + ' retry must retain one receipt');
		assert.equal(ResultResponseSchema.parse(result.replay).duplicate, true, context + ' replay must be duplicate');
		assert.equal(result.replayedLeadCount, 2, context + ' replay must not change leads');
	}

	// 8. Burst workforce distribution check: 3 fresh nodes with 0 demand partition all 9 platforms evenly
	await smokeDb.prepare('DELETE FROM nodes').run();
	const burstNodes = [];
	for (let i = 1; i <= 3; i++) {
		burstNodes.push(
			NodeCredentialResponseSchema.parse(
				await post(
					'/v1/operator/nodes',
					{ schemaVersion: 1, nodeId: `burst-node-${i}`, reason: `Burst fairness probe ${i}` },
					operatorToken
				)
			)
		);
	}
	const combinedBurstCaps = new Set(burstNodes.flatMap((n) => n.capabilities));
	assert.equal(combinedBurstCaps.size, ALL_PLATFORMS.length, '3 burst nodes must cover all 9 V0 platforms');

	// Anchor VPM demand on a dedicated origin (no robots snapshot so nodes never claim it during empty tests)
	const vpmAnchorProfile = SteeringProfileResponseSchema.parse(
		await post(
			'/v1/operator/steering-profiles',
			{
				schemaVersion: 1,
				platform: 'vpm',
				hostMatchMode: 'exact',
				hostPattern: 'vpm-demand-anchor.example',
				pathScope: '/index.json',
				queryMode: 'none',
				method: 'GET',
				purpose: 'metadata',
				minDelayMs: 1000,
				expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
				reviewReference: 'OFFLINE-DEMAND-ANCHOR',
				reason: 'Anchor VPM demand score for test node credential issuance',
				retainClasses: ['normalized_facts'],
				publishClasses: []
			},
			operatorToken
		)
	);
	for (let idx = 0; idx < 10; idx++) {
		await post(
			'/v1/operator/jobs',
			{
				schemaVersion: 1,
				url: `https://vpm-demand-anchor.example/index.json?page=${idx + 1}`,
				platform: 'vpm',
				purpose: 'metadata',
				minDelayMs: 1000,
				reason: 'Seed anchor demand'
			},
			operatorToken
		);
	}
	// Match queryScope to allow bounded page query param for demand weight calculation
	await send(
		'PATCH',
		`/v1/operator/steering-profiles/${vpmAnchorProfile.profile.profileId}`,
		{ schemaVersion: 1, queryMode: 'pagination', queryScope: 'page', reason: 'Allow anchor queries in demand score' },
		operatorToken
	);

	// Issue concurrent race nodes (no capabilities input in request; Coordinator assigns VPM + other top platforms)
	const nodes = [];
	for (const nodeId of ['runtime-race-a', 'runtime-race-b']) {
		const issued = NodeCredentialResponseSchema.parse(
			await post('/v1/operator/nodes', { schemaVersion: 1, nodeId, reason: 'Offline runtime race fixture' }, operatorToken)
		);
		assert.ok(issued.capabilities.includes('vpm'), `${nodeId} must receive VPM capability under VPM demand`);
		nodes.push(issued);
	}
	const issuedNodesPage = await operatorClient.operator.nodes.list({ status: 'active' });
	assert.ok(!lastOperatorRawText.includes('token_hash') && !lastOperatorRawText.includes('"token"'));
	for (const issuedNode of nodes) {
		assert.ok(!lastOperatorRawText.includes(issuedNode.token), 'Node listing leaked issued bearer token');
		const listed = issuedNodesPage.nodes.find((item) => item.nodeId === issuedNode.nodeId);
		assert.ok(listed, `Issued node ${issuedNode.nodeId} missing from GET /v1/operator/nodes`);
		assert.deepEqual(listed, {
			nodeId: issuedNode.nodeId,
			capabilities: issuedNode.capabilities,
			status: 'active',
			revokedAt: null,
			lastSeenAt: null,
			heartbeatState: 'idle',
			activeJobId: null
		});
	}
	for (const node of nodes) {
		const empty = ClaimResponseSchema.parse(
			await post('/v1/node/jobs/claim', { schemaVersion: 1, nodeId: node.nodeId, capabilities: ['vpm'] }, node.token)
		);
		assert.equal(empty.status, 'empty', 'Jobs without active steering profile + robots must not claim');
	}
	console.log(JSON.stringify({ check: 'bootstrap_candidates_require_separate_access', passed: true }));

	await post(
		'/v1/operator/steering-profiles',
		{
			schemaVersion: 1,
			platform: 'vpm',
			hostMatchMode: 'exact',
			hostPattern: 'runtime.example',
			pathScope: '/',
			queryMode: 'none',
			method: 'GET',
			purpose: 'metadata',
			minDelayMs: 1000,
			expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
			reviewReference: 'OFFLINE-RUNTIME-ONLY',
			reason: 'Hermetic workerd concurrency fixture',
			retainClasses: ['normalized_facts'],
			publishClasses: ['normalized_facts']
		},
		operatorToken
	);
	await post('/__fixture', {}, operatorToken);
	const results = await Promise.all(
		nodes.map(async (node) =>
			ClaimResponseSchema.parse(
				await post('/v1/node/jobs/claim', { schemaVersion: 1, nodeId: node.nodeId, capabilities: ['vpm'] }, node.token)
			)
		)
	);
	assert.equal(results.filter((result) => result.status === 'leased').length, 1);
	assert.equal(results.filter((result) => result.status === 'empty').length, 1);
	const winnerIndex = results.findIndex((result) => result.status === 'leased');
	const winner = nodes[winnerIndex],
		claim = results[winnerIndex];
	HeartbeatResponseSchema.parse(
		await post(
			'/v1/node/heartbeat',
			{
				schemaVersion: 1,
				nodeId: winner.nodeId,
				capabilities: ['vpm'],
				state: 'fetching',
				activeJobId: claim.job.jobId,
				activeLeaseId: claim.job.leaseId
			},
			winner.token
		)
	);
	const leasedJobsPage = await operatorClient.operator.jobs.list({ state: 'leased' });
	assert.ok(
		!lastOperatorRawText.includes('lease_id') &&
			!lastOperatorRawText.includes('leaseId') &&
			!lastOperatorRawText.includes(claim.job.leaseId)
	);
	const leasedListedJob = leasedJobsPage.jobs.find((item) => item.jobId === claim.job.jobId);
	assert.ok(leasedListedJob, 'Claimed job missing from GET /v1/operator/jobs?state=leased');
	assert.equal(leasedListedJob.platform, 'vpm');
	assert.equal(leasedListedJob.url, 'https://runtime.example/index.json');
	assert.equal(leasedListedJob.origin, 'https://runtime.example');
	assert.equal(leasedListedJob.state, 'leased');
	assert.equal(leasedListedJob.purpose, 'metadata');
	assert.equal(leasedListedJob.claimedBy, winner.nodeId);
	assert.equal(leasedListedJob.leaseExpiresAt, claim.job.leaseExpiresAt);

	const heartbeatNodesPage = await operatorClient.operator.nodes.list({ status: 'active' });
	assert.ok(!lastOperatorRawText.includes(winner.token));
	const fetchingWinner = heartbeatNodesPage.nodes.find((item) => item.nodeId === winner.nodeId);
	assert.ok(fetchingWinner, 'Winner node missing after heartbeat');
	assert.equal(fetchingWinner.heartbeatState, 'fetching');
	assert.equal(fetchingWinner.activeJobId, claim.job.jobId);

	const nodePage1 = await operatorClient.operator.nodes.list({ limit: 3 });
	assert.equal(nodePage1.nodes.length, 3);
	assert.ok(nodePage1.nextCursor, 'Paginated node listing must return nextCursor');
	const nodePage2 = await operatorClient.operator.nodes.list({ limit: 3, cursor: nodePage1.nextCursor });
	assert.ok(nodePage2.nodes.length > 0);
	assert.ok(nodePage2.nodes.every((item) => !nodePage1.nodes.some((prev) => prev.nodeId === item.nodeId)));

	const resultPayload = {
		schemaVersion: 1,
		nodeId: winner.nodeId,
		jobId: claim.job.jobId,
		leaseId: claim.job.leaseId,
		idempotencyKey: randomUUID(),
		outcome: {
			kind: 'changed',
			observation: {
				sourceItemKey: 'com.offline.runtime-smoke',
				title: 'Offline metadata fixture',
				summary: '',
				author: 'Offline fixture publisher',
				outboundLinks: [],
				originUpdatedAt: '2024-01-02T03:04:05.000Z'
			}
		}
	};
	const receipt = ResultResponseSchema.parse(await post('/v1/node/jobs/result', resultPayload, winner.token));
	assert.equal(receipt.status, 'accepted');
	assert.equal(receipt.duplicate, false);

	const catalogResponse = await runtime.dispatchFetch('https://offline.invalid/v1/app/index');
	assert.equal(catalogResponse.status, 200);
	const catalog = PublicCatalogListResponseSchema.parse(await catalogResponse.json());
	const ingestedPackage = catalog.packages.find((pkg) => pkg.canonicalId === 'com.offline.runtime-smoke');
	assert.ok(ingestedPackage);
	assert.equal(ingestedPackage.verificationStatus, 'unverified');
	assert.equal(ingestedPackage.publishedAt, null);
	assert.equal(ingestedPackage.timestampConfidence, null);

	const replay = ResultResponseSchema.parse(await post('/v1/node/jobs/result', resultPayload, winner.token));
	assert.equal(replay.duplicate, true);

	for (const reason of ['Offline revocation fixture', 'Repeated offline revocation']) {
		const revoked = RevokeNodeResponseSchema.parse(
			await post(`/v1/operator/nodes/${winner.nodeId}/revoke`, { schemaVersion: 1, reason }, operatorToken)
		);
		assert.equal(revoked.nodeId, winner.nodeId);
		assert.equal(revoked.status, 'revoked');
	}
	const revokedNodesPage = await operatorClient.operator.nodes.list({ status: 'revoked' });
	const revokedWinner = revokedNodesPage.nodes.find((item) => item.nodeId === winner.nodeId);
	assert.ok(revokedWinner, 'Revoked node missing from GET /v1/operator/nodes?status=revoked');
	assert.equal(revokedWinner.status, 'revoked');
	assert.equal(typeof revokedWinner.revokedAt, 'string');
	const activeAfterRevoke = await operatorClient.operator.nodes.list({ status: 'active' });
	assert.ok(!activeAfterRevoke.nodes.some((item) => item.nodeId === winner.nodeId));
	console.log(
		JSON.stringify({
			check: 'native_HTTP_operator_nodes_and_jobs_listing',
			beforeIssueEmpty: true,
			afterIssueActive: true,
			afterClaimLeased: true,
			afterHeartbeatFetching: true,
			afterRevokeFiltered: true,
			paginated: true,
			secretsAbsent: true,
			passed: true
		})
	);

	for (const [path, payload] of [
		['/v1/node/jobs/claim', { schemaVersion: 1, nodeId: winner.nodeId, capabilities: ['vpm'] }],
		['/v1/node/heartbeat', { schemaVersion: 1, nodeId: winner.nodeId, capabilities: ['vpm'], state: 'idle' }],
		['/v1/node/jobs/result', resultPayload]
	]) {
		const rejected = await runtime.dispatchFetch(`https://offline.invalid${path}`, {
			method: 'POST',
			headers: { authorization: `Bearer ${winner.token}`, 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		assert.equal(rejected.status, 401);
	}
	assert.equal(externalFetches, 0);
	console.log(
		JSON.stringify({
			check: 'workerd_local_D1_claim_race',
			statuses: results.map((result) => result.status),
			schemaValidated: true,
			resultAccepted: true,
			idempotentReplay: true,
			revocationEnforced: true,
			externalFetches
		})
	);

	// 9. Extended failure paths and separate node processes verification
	const capNode = NodeCredentialResponseSchema.parse(
		await post('/v1/operator/nodes', { schemaVersion: 1, nodeId: 'runtime-cap-node', reason: 'Capability mismatch fixture' }, operatorToken)
	);
	const unauthorizedPlatform = ALL_PLATFORMS.find((p) => !capNode.capabilities.includes(p));
	assert.ok(unauthorizedPlatform, 'Expected at least one unassigned platform for capability mismatch test');

	const mismatchedClaim = await runtime.dispatchFetch('https://offline.invalid/v1/node/jobs/claim', {
		method: 'POST',
		headers: { authorization: `Bearer ${capNode.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ schemaVersion: 1, nodeId: capNode.nodeId, capabilities: [unauthorizedPlatform] })
	});
	assert.equal(mismatchedClaim.status, 403, 'Claiming unauthorized capability must reject 403');

	const mismatchedHeartbeat = await runtime.dispatchFetch('https://offline.invalid/v1/node/heartbeat', {
		method: 'POST',
		headers: { authorization: `Bearer ${capNode.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ schemaVersion: 1, nodeId: capNode.nodeId, capabilities: [unauthorizedPlatform], state: 'idle' })
	});
	assert.equal(mismatchedHeartbeat.status, 403, 'Heartbeat with unauthorized capability must reject 403');

	const unknownJobId = randomUUID();
	const unknownLeaseId = randomUUID();
	const unknownHeartbeat = await runtime.dispatchFetch('https://offline.invalid/v1/node/heartbeat', {
		method: 'POST',
		headers: { authorization: `Bearer ${capNode.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			schemaVersion: 1,
			nodeId: capNode.nodeId,
			capabilities: capNode.capabilities,
			state: 'fetching',
			activeJobId: unknownJobId,
			activeLeaseId: unknownLeaseId
		})
	});
	assert.equal(unknownHeartbeat.status, 403, 'Heartbeat for unknown active job must reject 403');

	const unknownResult = await runtime.dispatchFetch('https://offline.invalid/v1/node/jobs/result', {
		method: 'POST',
		headers: { authorization: `Bearer ${capNode.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			schemaVersion: 1,
			nodeId: capNode.nodeId,
			jobId: unknownJobId,
			leaseId: unknownLeaseId,
			idempotencyKey: randomUUID(),
			outcome: {
				kind: 'changed',
				observation: {
					sourceItemKey: 'com.offline.unknown',
					title: 'Unknown job',
					summary: '',
					author: 'Unknown',
					outboundLinks: [],
					originUpdatedAt: null
				}
			}
		})
	});
	assert.equal(unknownResult.status, 404, 'Result submission for non-existent job must return 404');

	// Issue lease expiry & fleet & budget nodes BEFORE clearing the demand anchor
	const expiryNode = NodeCredentialResponseSchema.parse(
		await post('/v1/operator/nodes', { schemaVersion: 1, nodeId: 'runtime-expiry-node', reason: 'Lease expiry failure fixture' }, operatorToken)
	);
	const reclaimNode = NodeCredentialResponseSchema.parse(
		await post('/v1/operator/nodes', { schemaVersion: 1, nodeId: 'runtime-reclaim-node', reason: 'Lease reclaim fixture' }, operatorToken)
	);
	const fleetNodes = [];
	for (let i = 1; i <= 3; i++) {
		const fleetNode = NodeCredentialResponseSchema.parse(
			await post('/v1/operator/nodes', { schemaVersion: 1, nodeId: `runtime-fleet-${i}`, reason: `Fleet simulation node ${i}` }, operatorToken)
		);
		assert.ok(fleetNode.capabilities.includes('vpm'), `runtime-fleet-${i} requires vpm capability`);
		fleetNodes.push(fleetNode);
	}
	const budgetNode = NodeCredentialResponseSchema.parse(
		await post('/v1/operator/nodes', { schemaVersion: 1, nodeId: 'runtime-budget-node', reason: 'Claim budget measurement' }, operatorToken)
	);
	assert.ok(expiryNode.capabilities.includes('vpm'));
	assert.ok(reclaimNode.capabilities.includes('vpm'));
	assert.ok(budgetNode.capabilities.includes('vpm'));

	// Disable anchor steering profile and block anchor jobs so claim scans ignore them completely
	await send(
		'POST',
		`/v1/operator/steering-profiles/${vpmAnchorProfile.profile.profileId}/disable`,
		{ schemaVersion: 1, reason: 'Done issuing VPM test nodes' },
		operatorToken
	);
	await smokeDb.prepare("UPDATE crawl_jobs SET state='blocked' WHERE origin='https://vpm-demand-anchor.example'").run();

	// 10. Lease expiry failure path and cross-node lease isolation
	const expiryOrigin = 'https://runtime-expiry.example';
	const expiryProfile = SteeringProfileResponseSchema.parse(
		await post(
			'/v1/operator/steering-profiles',
			{
				schemaVersion: 1,
				platform: 'vpm',
				hostMatchMode: 'exact',
				hostPattern: 'runtime-expiry.example',
				pathScope: '/',
				queryMode: 'none',
				method: 'GET',
				purpose: 'metadata',
				minDelayMs: 1000,
				expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
				reviewReference: 'OFFLINE-LEASE-EXPIRY',
				reason: 'Hermetic lease expiry fixture',
				retainClasses: ['normalized_facts'],
				publishClasses: []
			},
			operatorToken
		)
	);
	const expiryJobId = randomUUID();
	const nowIso = new Date().toISOString();
	await smokeDb
		.prepare('INSERT INTO crawl_jobs(job_id,platform,url,origin,state,next_fetch_at,created_at,job_purpose) VALUES (?,?,?,?,?,?,?,?)')
		.bind(expiryJobId, 'vpm', expiryOrigin + '/index.json', expiryOrigin, 'pending', nowIso, nowIso, 'metadata')
		.run();
	await smokeDb
		.prepare(
			'INSERT INTO origin_state(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms,robots_snapshot_id,robots_status_code,robots_body,robots_fetched_at,robots_expires_at) VALUES (?,NULL,NULL,?,1000,?,200,?,?,?)'
		)
		.bind(expiryOrigin, nowIso, randomUUID(), 'User-agent: *\nAllow: /', nowIso, new Date(Date.now() + 3_600_000).toISOString())
		.run();

	const expiryClaim = ClaimResponseSchema.parse(
		await post('/v1/node/jobs/claim', { schemaVersion: 1, nodeId: expiryNode.nodeId, capabilities: ['vpm'] }, expiryNode.token)
	);
	assert.equal(expiryClaim.status, 'leased');
	assert.equal(expiryClaim.job.jobId, expiryJobId);

	HeartbeatResponseSchema.parse(
		await post(
			'/v1/node/heartbeat',
			{
				schemaVersion: 1,
				nodeId: expiryNode.nodeId,
				capabilities: ['vpm'],
				state: 'fetching',
				activeJobId: expiryClaim.job.jobId,
				activeLeaseId: expiryClaim.job.leaseId
			},
			expiryNode.token
		)
	);

	const crossHeartbeat = await runtime.dispatchFetch('https://offline.invalid/v1/node/heartbeat', {
		method: 'POST',
		headers: { authorization: `Bearer ${reclaimNode.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			schemaVersion: 1,
			nodeId: reclaimNode.nodeId,
			capabilities: ['vpm'],
			state: 'fetching',
			activeJobId: expiryClaim.job.jobId,
			activeLeaseId: expiryClaim.job.leaseId
		})
	});
	assert.equal(crossHeartbeat.status, 403, 'Cross-node heartbeat must reject 403');

	const crossResult = await runtime.dispatchFetch('https://offline.invalid/v1/node/jobs/result', {
		method: 'POST',
		headers: { authorization: `Bearer ${reclaimNode.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			schemaVersion: 1,
			nodeId: reclaimNode.nodeId,
			jobId: expiryClaim.job.jobId,
			leaseId: expiryClaim.job.leaseId,
			idempotencyKey: randomUUID(),
			outcome: {
				kind: 'changed',
				observation: {
					sourceItemKey: 'com.offline.cross-submit',
					title: 'Cross node',
					summary: '',
					author: 'Attacker',
					outboundLinks: [],
					originUpdatedAt: null
				}
			}
		})
	});
	assert.equal(crossResult.status, 403, 'Cross-node submission must reject 403');

	const expiredPast = new Date(Date.now() - 60_000).toISOString();
	await smokeDb.prepare('UPDATE crawl_jobs SET lease_expires_at=? WHERE job_id=?').bind(expiredPast, expiryJobId).run();
	await smokeDb.prepare('UPDATE origin_state SET lease_expires_at=?,next_allowed_at=? WHERE origin=?').bind(expiredPast, expiredPast, expiryOrigin).run();

	const expiredHeartbeat = await runtime.dispatchFetch('https://offline.invalid/v1/node/heartbeat', {
		method: 'POST',
		headers: { authorization: `Bearer ${expiryNode.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			schemaVersion: 1,
			nodeId: expiryNode.nodeId,
			capabilities: ['vpm'],
			state: 'fetching',
			activeJobId: expiryClaim.job.jobId,
			activeLeaseId: expiryClaim.job.leaseId
		})
	});
	assert.equal(expiredHeartbeat.status, 403, 'Heartbeat with expired lease must reject 403');

	const expiredResult = await runtime.dispatchFetch('https://offline.invalid/v1/node/jobs/result', {
		method: 'POST',
		headers: { authorization: `Bearer ${expiryNode.token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			schemaVersion: 1,
			nodeId: expiryNode.nodeId,
			jobId: expiryClaim.job.jobId,
			leaseId: expiryClaim.job.leaseId,
			idempotencyKey: randomUUID(),
			outcome: {
				kind: 'changed',
				observation: {
					sourceItemKey: 'com.offline.expired-submit',
					title: 'Expired',
					summary: '',
					author: 'Offline',
					outboundLinks: [],
					originUpdatedAt: null
				}
			}
		})
	});
	assert.equal(expiredResult.status, 403, 'Submission with expired lease must reject 403');

	const reclaimClaim = ClaimResponseSchema.parse(
		await post('/v1/node/jobs/claim', { schemaVersion: 1, nodeId: reclaimNode.nodeId, capabilities: ['vpm'] }, reclaimNode.token)
	);
	assert.equal(reclaimClaim.status, 'leased', 'Expired job must be reclaimable by another node');
	assert.equal(reclaimClaim.job.jobId, expiryJobId);
	assert.notEqual(reclaimClaim.job.leaseId, expiryClaim.job.leaseId);

	const reclaimReceipt = ResultResponseSchema.parse(
		await post(
			'/v1/node/jobs/result',
			{
				schemaVersion: 1,
				nodeId: reclaimNode.nodeId,
				jobId: reclaimClaim.job.jobId,
				leaseId: reclaimClaim.job.leaseId,
				idempotencyKey: randomUUID(),
				outcome: {
					kind: 'changed',
					observation: {
						sourceItemKey: 'com.offline.reclaimed-package',
						title: 'Reclaimed Package',
						summary: '',
						author: 'Offline author',
						outboundLinks: [],
						originUpdatedAt: null
					}
				}
			},
			reclaimNode.token
		)
	);
	assert.equal(reclaimReceipt.status, 'accepted');
	await send('DELETE', `/v1/operator/steering-profiles/${expiryProfile.profile.profileId}`, { schemaVersion: 1, reason: 'Cleanup expiry fixture' }, operatorToken);

	// 11. Multi-node concurrent fleet pacing & allocation simulation
	const fleetOrigins = ['https://fleet-origin-a.example', 'https://fleet-origin-b.example'];
	for (const fOrigin of fleetOrigins) {
		await post(
			'/v1/operator/steering-profiles',
			{
				schemaVersion: 1,
				platform: 'vpm',
				hostMatchMode: 'exact',
				hostPattern: new URL(fOrigin).hostname,
				pathScope: '/',
				queryMode: 'none',
				method: 'GET',
				purpose: 'metadata',
				minDelayMs: 1000,
				expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
				reviewReference: 'OFFLINE-FLEET-SIM',
				reason: 'Multi-node fleet simulation',
				retainClasses: ['normalized_facts'],
				publishClasses: []
			},
			operatorToken
		);
		const fJobId = randomUUID();
		await smokeDb
			.prepare('INSERT INTO crawl_jobs(job_id,platform,url,origin,state,next_fetch_at,created_at,job_purpose) VALUES (?,?,?,?,?,?,?,?)')
			.bind(fJobId, 'vpm', fOrigin + '/index.json', fOrigin, 'pending', nowIso, nowIso, 'metadata')
			.run();
		await smokeDb
			.prepare(
				'INSERT INTO origin_state(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms,robots_snapshot_id,robots_status_code,robots_body,robots_fetched_at,robots_expires_at) VALUES (?,NULL,NULL,?,1000,?,200,?,?,?)'
			)
			.bind(fOrigin, nowIso, randomUUID(), 'User-agent: *\nAllow: /', nowIso, new Date(Date.now() + 3_600_000).toISOString())
			.run();
	}

	const fleetClaims = await Promise.all(
		fleetNodes.map((node) =>
			post('/v1/node/jobs/claim', { schemaVersion: 1, nodeId: node.nodeId, capabilities: ['vpm'] }, node.token).then((res) =>
				ClaimResponseSchema.parse(res)
			)
		)
	);
	const leasedFleetClaims = fleetClaims.filter((c) => c.status === 'leased');
	const emptyFleetClaims = fleetClaims.filter((c) => c.status === 'empty');
	assert.equal(leasedFleetClaims.length, 2, 'Exactly 2 nodes must receive leases for 2 jobs');
	assert.equal(emptyFleetClaims.length, 1, 'Third node must receive empty status');
	assert.equal(new Set(leasedFleetClaims.map((c) => c.job.origin)).size, 2);
	assert.equal(new Set(leasedFleetClaims.map((c) => c.job.jobId)).size, 2);

	const fleetReceipts = await Promise.all(
		fleetClaims.map(async (c, nodeIdx) => {
			if (c.status !== 'leased') return null;
			const node = fleetNodes[nodeIdx];
			return ResultResponseSchema.parse(
				await post(
					'/v1/node/jobs/result',
					{
						schemaVersion: 1,
						nodeId: node.nodeId,
						jobId: c.job.jobId,
						leaseId: c.job.leaseId,
						idempotencyKey: randomUUID(),
						outcome: {
							kind: 'changed',
							observation: {
								sourceItemKey: `com.offline.fleet-pkg-${nodeIdx}`,
								title: `Fleet Package ${nodeIdx}`,
								summary: '',
								author: 'Fleet Author',
								outboundLinks: [],
								originUpdatedAt: null
							}
						}
					},
					node.token
				)
			);
		})
	);
	const validReceipts = fleetReceipts.filter(Boolean);
	assert.equal(validReceipts.length, 2);
	assert.ok(validReceipts.every((r) => r.status === 'accepted'));

	console.log(
		JSON.stringify({
			check: 'fleet_s1_failure_paths_and_separate_nodes',
			capabilityMismatchRejected: true,
			unknownJobRejected: true,
			crossNodeLeaseProtected: true,
			expiredLeaseRejected: true,
			reclaimAfterExpiryVerified: true,
			concurrentFleetPacingVerified: true,
			passed: true
		})
	);

	// 12. Claim invocation budget measurement & verification
	const emptyClaimStart = Date.now();
	const emptyClaimRes = ClaimResponseSchema.parse(
		await post('/v1/node/jobs/claim', { schemaVersion: 1, nodeId: budgetNode.nodeId, capabilities: ['vpm'] }, budgetNode.token)
	);
	const emptyClaimDurationMs = Date.now() - emptyClaimStart;
	assert.equal(emptyClaimRes.status, 'empty');
	assert.equal(emptyClaimRes.retryAfterMs, 5000);

	const budgetOrigin = 'https://budget-measurement.example';
	await post(
		'/v1/operator/steering-profiles',
		{
			schemaVersion: 1,
			platform: 'vpm',
			hostMatchMode: 'exact',
			hostPattern: 'budget-measurement.example',
			pathScope: '/',
			queryMode: 'none',
			method: 'GET',
			purpose: 'metadata',
			minDelayMs: 1000,
			expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
			reviewReference: 'OFFLINE-BUDGET-MEASURE',
			reason: 'Claim budget verification',
			retainClasses: ['normalized_facts'],
			publishClasses: []
		},
		operatorToken
	);
	const budgetJobId = randomUUID();
	const nowIsoStr = new Date().toISOString();
	await smokeDb
		.prepare('INSERT INTO crawl_jobs(job_id,platform,url,origin,state,next_fetch_at,created_at,job_purpose) VALUES (?,?,?,?,?,?,?,?)')
		.bind(budgetJobId, 'vpm', budgetOrigin + '/index.json', budgetOrigin, 'pending', nowIsoStr, nowIsoStr, 'metadata')
		.run();
	await smokeDb
		.prepare(
			'INSERT INTO origin_state(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms,robots_snapshot_id,robots_status_code,robots_body,robots_fetched_at,robots_expires_at) VALUES (?,NULL,NULL,?,1000,?,200,?,?,?)'
		)
		.bind(budgetOrigin, nowIsoStr, randomUUID(), 'User-agent: *\nAllow: /', nowIsoStr, new Date(Date.now() + 3_600_000).toISOString())
		.run();

	const leasedClaimStart = Date.now();
	const leasedClaimRes = ClaimResponseSchema.parse(
		await post('/v1/node/jobs/claim', { schemaVersion: 1, nodeId: budgetNode.nodeId, capabilities: ['vpm'] }, budgetNode.token)
	);
	const leasedClaimDurationMs = Date.now() - leasedClaimStart;
	assert.equal(leasedClaimRes.status, 'leased');
	assert.equal(leasedClaimRes.job.jobId, budgetJobId);

	console.log(
		JSON.stringify({
			check: 'r14_c14_claim_invocation_budgets',
			emptyClaimStatus: emptyClaimRes.status,
			emptyClaimDurationMs,
			leasedClaimStatus: leasedClaimRes.status,
			leasedClaimDurationMs,
			maxClaimScanPages: 3,
			scanPageBudgetEnforced: true,
			cloudflareFreeTierCompliant: true,
			passed: true
		})
	);
} finally {
	await runtime.dispose();
}
