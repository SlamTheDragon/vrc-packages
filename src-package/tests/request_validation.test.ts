import { expect, test } from "bun:test";
import { VRCPackageClient, VRCPApiError } from "../src/client.ts";
import { CURSOR_TOKEN_MAX_LENGTH } from "../src/encoding/cursor.ts";
import {
  IssueNodeCredentialSchema,
  encodeLeadCursor,
  encodeSteeringProfileCursor,
  encodeSuppressedTargetCursor,
  encodeTakedownCursor,
  encodeDelegatedClaimCursor,
  encodeOperatorAppCursor,
  encodeOperatorNodeCursor,
  encodeOperatorJobCursor
} from "../src/protocol/operator.ts";
import { encodeCatalogCursor, encodeCatalogDeltaCursor } from "../src/protocol/catalog.ts";

test("SDK list queries reject invalid bounds, cursors and unknown fields without fetching", async () => {
  let calls = 0;
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    operatorToken: "fixture-operator",
    userToken: "fixture-user",
    fetch: Object.assign(async () => {
      calls++;
      throw new Error("Invalid query reached transport");
    }, { preconnect() {} })
  });
  const lists = [
    client.index.syncDeltas,
    client.user.apps.list,
    client.operator.leads.list,
    client.operator.steeringProfiles.list,
    client.operator.suppressedTargets.list,
    client.operator.nodes.list,
    client.operator.jobs.list,
    client.operator.catalog.list,
    client.operator.takedowns.list,
    client.operator.claims.list,
    client.operator.apps.list,
    client.moderator.ratings.list,
    client.moderator.apps.list
  ];
  for (const params of [
    { limit: 0 },
    { limit: 101 },
    { limit: NaN },
    { limit: 1.5 },
    { limit: "10" },
    { limit: "abc" },
    { extra: true }
  ]) {
    for (const list of lists) await expect(list(params as never)).rejects.toThrow();
    expect(calls).toBe(0);
  }
  const cursorLists = [
    client.index.syncDeltas,
    client.operator.leads.list,
    client.operator.steeringProfiles.list,
    client.operator.suppressedTargets.list,
    client.operator.nodes.list,
    client.operator.jobs.list,
    client.operator.catalog.list,
    client.operator.takedowns.list,
    client.operator.claims.list,
    client.operator.apps.list,
    client.moderator.ratings.list,
    client.moderator.apps.list
  ];
  for (const params of [{ cursor: "" }, { cursor: "invalid!" }, { cursor: "YWJj" }]) {
    for (const list of cursorLists) await expect(list(params as never)).rejects.toThrow();
    expect(calls).toBe(0);
  }
  await expect(client.user.apps.list({ cursor: "not-a-uuid" })).rejects.toThrow();
  expect(calls).toBe(0);
  const cursor = encodeLeadCursor({ status: "approved", firstSeenAt: "2026-10-04T00:00:00.000Z", leadKey: "a".repeat(64) });
  await expect(client.operator.leads.list({ status: "rejected", cursor })).rejects.toThrow();
  await expect(client.operator.leads.list({ status: "invalid" } as never)).rejects.toThrow();
  await expect(client.operator.nodes.list({ status: "invalid" } as never)).rejects.toThrow();
  await expect(client.operator.nodes.list({
    cursor: encodeOperatorJobCursor({ createdAt: "2026-10-04T00:00:00.000Z", jobId: "job-b1" })
  })).rejects.toThrow();
  await expect(client.operator.jobs.list({ state: "invalid" } as never)).rejects.toThrow();
  await expect(client.operator.jobs.list({ platform: "invalid" } as never)).rejects.toThrow();
  await expect(client.operator.jobs.list({ platform: "curated" } as never)).rejects.toThrow();
  await expect(client.operator.jobs.list({ priorityLane: 5 } as never)).rejects.toThrow();
  await expect(client.operator.jobs.list({
    cursor: encodeOperatorNodeCursor({ nodeId: "node-1" })
  })).rejects.toThrow();
  await expect(client.operator.steeringProfiles.list({
    cursor: encodeSuppressedTargetCursor({ suppressedAt: "2026-10-04T00:00:00.000Z", target: "bad.example" })
  })).rejects.toThrow();
  await expect(client.operator.suppressedTargets.list({
    cursor: encodeSteeringProfileCursor({ createdAt: "2026-10-04T00:00:00.000Z", profileId: "00000000-0000-4000-8000-000000000001" })
  })).rejects.toThrow();
  await expect(client.operator.takedowns.list({ requesterType: "invalid" } as never)).rejects.toThrow();
  await expect(client.operator.claims.list({ reviewStatus: "invalid" } as never)).rejects.toThrow();
  await expect(client.operator.apps.list({ candidateStatus: "invalid" } as never)).rejects.toThrow();
  expect(calls).toBe(0);
});

test("SDK list queries preserve opaque cursor bytes and route-specific defaults", async () => {
  const urls: URL[] = [];
  const rejection = new Error("Fixture transport stop");
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    operatorToken: "fixture-operator",
    fetch: Object.assign(async (input: RequestInfo | URL) => {
      urls.push(new URL(String(input)));
      throw rejection;
    }, { preconnect() {} })
  });
  const time = "2026-10-04T00:00:00.000Z";
  const id = "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF";
  const cursors = [
    encodeCatalogDeltaCursor({ updatedAt: time, canonicalId: "CaseSensitive.Package" }),
    encodeLeadCursor({ status: "approved", firstSeenAt: time, leadKey: "a".repeat(64) }),
    encodeSteeringProfileCursor({ createdAt: time, profileId: id }),
    encodeSuppressedTargetCursor({ suppressedAt: time, target: "bad.example" }),
    encodeCatalogCursor({ createdAt: time, canonicalId: "CaseSensitive.Package" }),
    encodeTakedownCursor({ recordedAt: time, takedownId: id }),
    encodeDelegatedClaimCursor({ recordedAt: time, claimId: id }),
    encodeOperatorAppCursor({ createdAt: time, appId: id }),
    encodeOperatorNodeCursor({ nodeId: "Node.1" }),
    encodeOperatorJobCursor({ createdAt: time, jobId: "job-b1" })
  ];
  const actions = [
    () => client.index.syncDeltas({ cursor: cursors[0] }),
    () => client.operator.leads.list({ status: "approved", cursor: cursors[1] }),
    () => client.operator.steeringProfiles.list({ cursor: cursors[2] }),
    () => client.operator.suppressedTargets.list({ cursor: cursors[3] }),
    () => client.operator.catalog.list({ cursor: cursors[4] }),
    () => client.operator.takedowns.list({ requesterType: "user", cursor: cursors[5] }),
    () => client.operator.claims.list({ reviewStatus: "pending", cursor: cursors[6] }),
    () => client.operator.apps.list({ candidateStatus: "review_pending", cursor: cursors[7] }),
    () => client.operator.nodes.list({ status: "active", cursor: cursors[8] }),
    () => client.operator.jobs.list({ state: "leased", platform: "booth", priorityLane: 2, cursor: cursors[9] })
  ];
  for (const invoke of actions) await expect(invoke()).rejects.toThrow(rejection.message);
  for (const [index, url] of urls.entries()) {
    expect(url.searchParams.get("cursor")).toBe(cursors[index]);
    expect(url.searchParams.get("limit")).toBe(index === 0 ? "50" : "100");
  }
  expect(urls[1]!.searchParams.get("status")).toBe("approved");
  expect(urls[5]!.searchParams.get("requesterType")).toBe("user");
  expect(urls[6]!.searchParams.get("reviewStatus")).toBe("pending");
  expect(urls[7]!.searchParams.get("candidateStatus")).toBe("review_pending");
  expect(urls[8]!.searchParams.get("status")).toBe("active");
  expect(urls[9]!.searchParams.get("state")).toBe("leased");
  expect(urls[9]!.searchParams.get("platform")).toBe("booth");
  expect(urls[9]!.searchParams.get("priorityLane")).toBe("2");
});

test("SDK UUID paths and raw app cursors use lowercase without changing node IDs", async () => {
  const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
  const rejection = new Error("Fixture transport stop");
  const urls: Array<{ method: string; url: URL }> = [];
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    operatorToken: "fixture-operator",
    userToken: "fixture-user",
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      urls.push({ method: req.method, url: new URL(req.url) });
      throw rejection;
    }, { preconnect() {} })
  });
  const actions = [
    () => client.user.apps.get(id.toUpperCase()),
    () => client.user.apps.list({ cursor: id.toUpperCase() }),
    () => client.operator.steeringProfiles.update(id.toUpperCase(), { minDelayMs: 2500, reason: "Updated delay" }),
    () => client.operator.steeringProfiles.enable(id.toUpperCase(), "Re-enabled profile"),
    () => client.operator.steeringProfiles.disable(id.toUpperCase(), "Reviewed profile"),
    () => client.operator.steeringProfiles.delete(id.toUpperCase(), "Pruned profile"),
    () => client.operator.takedowns.verify(id.toUpperCase(), { verdict: "accepted" }),
    () => client.operator.claims.verify(id.toUpperCase(), { verdict: "accepted" }),
    () => client.operator.apps.setDelegation(id.toUpperCase(), { delegationAllowed: true }),
    () => client.operator.apps.reviewCandidate(id.toUpperCase(), { candidateStatus: "reviewed" }),
    () => client.moderator.apps.reviewCandidate(id.toUpperCase(), { candidateStatus: "reviewed" }),
    () => client.operator.nodes.revoke("Node.1", "Reviewed node"),
    () => client.operator.nodes.prune("Node.1", "Pruned node")
  ];
  for (const invoke of actions) await expect(invoke()).rejects.toThrow(rejection.message);
  expect(urls.map(entry => `${entry.method} ${entry.url.pathname}`)).toEqual([
    `GET /v1/user/apps/${id}`,
    `GET /v1/user/apps`,
    `PATCH /v1/operator/steering-profiles/${id}`,
    `POST /v1/operator/steering-profiles/${id}/enable`,
    `POST /v1/operator/steering-profiles/${id}/disable`,
    `DELETE /v1/operator/steering-profiles/${id}`,
    `POST /v1/operator/takedowns/${id}/verify`,
    `POST /v1/operator/claims/${id}/verify`,
    `POST /v1/operator/apps/${id}/delegation`,
    `POST /v1/operator/apps/${id}/candidate-review`,
    `POST /v1/moderator/apps/${id}/candidate-review`,
    "POST /v1/operator/nodes/Node.1/revoke",
    "DELETE /v1/operator/nodes/Node.1"
  ]);
  expect(urls[1]!.url.searchParams.get("cursor")).toBe(id);
});

test("node issuance distinguishes navigation segments and rejects manual capabilities", () => {
  for (const nodeId of [".", "..", "...", "Node.1", "node-1", "node_1"]) {
    expect(IssueNodeCredentialSchema.safeParse({
      schemaVersion: 1,
      nodeId,
      reason: "Reviewed node"
    }).success).toBe(nodeId !== "." && nodeId !== "..");
  }
  expect(IssueNodeCredentialSchema.safeParse({
    schemaVersion: 1,
    nodeId: "node-1",
    capabilities: ["vpm"],
    reason: "Manual capabilities rejected"
  }).success).toBe(false);
});

test("every SDK auth namespace rejects redirects through its fetch policy", async () => {
  let calls = 0;
  let cancelled = 0;
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    appToken: "fixture-app",
    userToken: "fixture-user",
    operatorToken: "fixture-operator",
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const request = new Request(input, init);
      expect(request.redirect).toBe("manual");
      expect(new URL(request.url).origin).toBe("https://worker.example");
      return new Response(new ReadableStream({ cancel() { cancelled++; } }), {
        status: 302, headers: { location: "https://outside.example/" }
      });
    }, { preconnect() {} })
  });
  const actions = [
    () => client.index.query(),
    () => client.index.search({ queryOrigin: "user_authored", query: "tools" }),
    () => client.user.apps.list(),
    () => client.operator.init()
  ];
  for (const [index, invoke] of actions.entries()) {
    let caught: unknown;
    try {
      await invoke();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(VRCPApiError);
    expect((caught as VRCPApiError).status).toBe(302);
    expect((caught as Error).message).toBe("API redirects are not permitted");
    expect(calls).toBe(index + 1);
    expect(cancelled).toBe(index + 1);
  }
});

test("SDK rejects browser opaque redirects without reading or following them", async () => {
  const response = new Response(null);
  Object.defineProperties(response, { type: { value: "opaqueredirect" }, status: { value: 0 } });
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    fetch: Object.assign(async () => response, { preconnect() {} })
  });
  await expect(client.index.query()).rejects.toMatchObject({ name: "VRCPApiError", status: 0 });
});

test("invalid SDK mutating inputs fail before invoking fetch", async () => {
  let calls = 0;
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    operatorToken: "fixture-operator",
    userToken: "fixture-user",
    appToken: "fixture-app",
    fetch: Object.assign(async () => {
      calls++;
      throw new Error("Invalid payload reached transport");
    }, { preconnect() {} })
  });
  const leadKey = "a".repeat(64);
  const id = "00000000-0000-4000-8000-000000000001";
  const invalid: Array<() => Promise<unknown>> = [
    () => client.index.search({ queryOrigin: "invalid" } as never),
    () => client.index.search({ queryOrigin: "user_authored", rating: "invalid" as never }),
    () => client.index.search({ queryOrigin: "user_authored", umbrella: "invalid" as never }),
    () => client.index.search({ queryOrigin: "user_authored", platform: "curated" as never }),
    () => client.app.register({ schemaVersion: 1, appName: "Valid app", extra: true } as never),
    () => client.reports.submit({ schemaVersion: 1, reportType: "removal_request", canonicalId: "fixture" } as never),
    () => client.reports.submit({ schemaVersion: 1, reportType: "removal_request", reason: "Missing target" } as never),
    () => client.reports.submit({
      schemaVersion: 1,
      reportType: "relationship_feedback",
      canonicalId: "pkg-1",
      relationType: "compatible_with_avatar",
      vote: "up"
    } as never),
    () => client.reports.submit({
      schemaVersion: 1,
      reportType: "relationship_feedback",
      canonicalId: "pkg-1",
      targetAvatarBase: "Kikyo",
      relationType: "compatible_with_avatar",
      vote: "sideways"
    } as never),
    () => client.reports.submit({ schemaVersion: 1, reportType: "demand_signal", reportKind: "broken_link" } as never),
    () => client.reports.submit({ schemaVersion: 1, reportType: "issue_report", canonicalId: "fixture" } as never),
    () => client.reports.submit({ schemaVersion: 1, reportType: "issue_report", reportKind: "broken_link", signalKind: "search_miss" } as never),
    () => client.reports.submit({ schemaVersion: 1, reportType: "issue_report", reportKind: "broken_link", query: "missing", zeroHits: true } as never),
    () => client.operator.init({ autoSeed: true } as never),
    () => client.operator.init({ autoSeed: "invalid" } as never),
    () => client.operator.systemPurge({ schemaVersion: 1, confirm: "PURGE_NOW" } as never),
    () => client.operator.systemPurge({ schemaVersion: 1, confirm: "PURGE_DEVELOPMENT_D1", extra: true } as never),
    () => client.operator.leads.approve(leadKey, { minDelayMs: -1, reason: "Reviewed lead" }),
    () => client.operator.leads.reject(leadKey, { reason: " " }),
    () => client.operator.leads.approve(leadKey, {} as never),
    () => client.operator.leads.reject(leadKey, {} as never),
    () => client.operator.leads.approve(leadKey, { reason: "Reviewed lead", extra: true } as never),
    () => client.operator.leads.reject(leadKey, { reason: "Reviewed lead", extra: true } as never),
    () => client.operator.leads.bulkApprove({ schemaVersion: 1, leadKeys: [], reason: "Empty keys" } as never),
    () => client.operator.leads.bulkApprove({ schemaVersion: 1, leadKeys: ["bad-key"], reason: "Bad key" } as never),
    () => client.operator.leads.suppressDomain({ schemaVersion: 1, targetHost: "https://bad.example", reason: "Has scheme" }),
    () => client.operator.leads.suppressDomain({ schemaVersion: 1, targetHost: "localhost", reason: "Localhost" }),
    () => client.operator.steeringProfiles.create({ schemaVersion: 999 } as never),
    () => client.operator.steeringProfiles.update(id, { reason: "No fields updated" }),
    () => client.operator.steeringProfiles.enable(id, " "),
    () => client.operator.steeringProfiles.disable(id, " "),
    () => client.operator.steeringProfiles.delete(id, " "),
    () => client.operator.suppressedTargets.create({ schemaVersion: 1, target: "http://bad.example/item", scope: "url", reason: "HTTP disallowed" }),
    () => client.operator.suppressedTargets.create({ schemaVersion: 1, target: "https://bad.example/", scope: "origin", reason: "Trailing slash" }),
    () => client.operator.suppressedTargets.create({ schemaVersion: 1, target: "bad.example/path", scope: "domain", reason: "Slash disallowed" }),
    () => client.operator.suppressedTargets.delete({ schemaVersion: 1, target: "bad.example", reason: " " }),
    () => client.operator.nodes.issue({ schemaVersion: 999 } as never),
    () => client.operator.nodes.issue({ schemaVersion: 1, nodeId: "node-1", capabilities: ["vpm"], reason: "Manual caps" } as never),
    () => client.operator.nodes.revoke("fixture-node", " "),
    () => client.operator.nodes.prune("fixture-node", " "),
    () => client.operator.takedowns.verify(id, { verdict: "invalid" } as never),
    () => client.operator.claims.verify(id, { verdict: "invalid" } as never),
    () => client.operator.apps.setDelegation(id, { delegationAllowed: "yes" } as never),
    () => client.operator.apps.reviewCandidate(id, { candidateStatus: "invalid" } as never),
    () => client.moderator.apps.reviewCandidate(id, { candidateStatus: "invalid" } as never),
    () => client.moderator.ratings.adjust("com.example.pkg", { newRating: "general", reason: "  " }),
    () => client.operator.jobs.enqueue({ schemaVersion: 999 } as never),
    () => client.operator.jobs.enqueue({
      schemaVersion: 1,
      url: "https://example.com/item",
      platform: "curated" as never,
      purpose: "metadata",
      minDelayMs: 2000,
      reason: "Curated purged"
    }),
    () => client.operator.jobs.update("job-1", { reason: "No fields" }),
    () => client.operator.jobs.update("job-1", { priorityLane: 5 as never, reason: "Invalid lane" }),
    () => client.operator.jobs.requeue("job-1", { reason: " " }),
    () => client.operator.jobs.delete("job-1", " ")
  ];
  for (const invoke of invalid) {
    await expect(invoke()).rejects.toThrow();
    expect(calls).toBe(0);
  }
});

test("SDK search rejects invalid bounds before transport instead of clamping them", async () => {
  let calls = 0;
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    appToken: "fixture-app",
    fetch: Object.assign(async () => {
      calls++;
      throw new Error("Invalid search reached transport");
    }, { preconnect() {} })
  });
  for (const limit of [0, -1, 51, 100, 1.5, NaN, Infinity]) {
    await expect(client.index.search({ queryOrigin: "user_authored", limit })).rejects.toThrow();
    expect(calls).toBe(0);
  }
  await expect(client.index.search({ queryOrigin: "app_automated", cursor: "x".repeat(CURSOR_TOKEN_MAX_LENGTH + 1) })).rejects.toThrow();
  expect(calls).toBe(0);
});

test("SDK path identifiers reject route-changing input before invoking fetch", async () => {
  let calls = 0;
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    operatorToken: "fixture-operator",
    userToken: "fixture-user",
    fetch: Object.assign(async () => {
      calls++;
      throw new Error("Invalid path reached transport");
    }, { preconnect() {} })
  });
  const invalid = ["", ".", "..", "../init", "id/disable", "id?reason=other", "id#fragment", "id%2Fdisable", " "];
  for (const id of invalid) {
    const actions: Array<() => Promise<unknown>> = [
      () => client.operator.leads.approve(id, { reason: "Reviewed lead" }),
      () => client.operator.leads.reject(id, { reason: "Reviewed lead" }),
      () => client.operator.steeringProfiles.update(id, { minDelayMs: 2000, reason: "Reviewed profile" }),
      () => client.operator.steeringProfiles.enable(id, "Reviewed profile"),
      () => client.operator.steeringProfiles.disable(id, "Reviewed profile"),
      () => client.operator.steeringProfiles.delete(id, "Reviewed profile"),
      () => client.operator.takedowns.verify(id, { verdict: "accepted" }),
      () => client.operator.claims.verify(id, { verdict: "accepted" }),
      () => client.operator.apps.setDelegation(id, { delegationAllowed: true }),
      () => client.operator.apps.reviewCandidate(id, { candidateStatus: "reviewed" }),
      () => client.moderator.apps.reviewCandidate(id, { candidateStatus: "reviewed" }),
      () => client.operator.nodes.revoke(id, "Reviewed node"),
      () => client.operator.nodes.prune(id, "Reviewed node"),
      () => client.operator.nodes.issue({ schemaVersion: 1, nodeId: id, reason: "Reviewed node" }),
      () => client.user.apps.get(id)
    ];
    for (const invoke of actions) {
      await expect(invoke()).rejects.toThrow();
      expect(calls).toBe(0);
    }
  }
});

test("operator job path methods reject blank and dot-segment IDs and safely encode special characters", async () => {
  let calls = 0;
  const urls: Array<{ method: string; url: URL }> = [];
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    operatorToken: "fixture-operator",
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const req = new Request(input, init);
      urls.push({ method: req.method, url: new URL(req.url) });
      throw new Error("Fixture transport stop");
    }, { preconnect() {} })
  });

  for (const badId of ["", ".", "..", " ", " . ", " .. ", "x".repeat(121)]) {
    await expect(client.operator.jobs.update(badId, { priorityLane: 1, reason: "Bad job ID" })).rejects.toThrow();
    await expect(client.operator.jobs.requeue(badId, { reason: "Bad job ID" })).rejects.toThrow();
    await expect(client.operator.jobs.delete(badId, "Bad job ID")).rejects.toThrow();
    expect(calls).toBe(0);
  }

  const encodedTarget = "job/segment?foo=bar#frag";
  await expect(client.operator.jobs.update(encodedTarget, { priorityLane: 1, reason: "Encode path" })).rejects.toThrow("Fixture transport stop");
  expect(urls.at(-1)?.method).toBe("PATCH");
  expect(urls.at(-1)?.url.pathname).toBe(`/v1/operator/jobs/${encodeURIComponent(encodedTarget)}`);
  expect(urls.at(-1)?.url.search).toBe("");
  expect(urls.at(-1)?.url.hash).toBe("");
});

test("moderator.ratings.adjust rejects blank and dot-segment canonical IDs and encodes path segments safely", async () => {
  let calls = 0;
  const urls: URL[] = [];
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    userToken: "fixture-user",
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      urls.push(new URL(new Request(input, init).url));
      throw new Error("Fixture transport stop");
    }, { preconnect() {} })
  });

  for (const badId of ["", ".", "..", " ", " . ", " .. ", "x".repeat(501)]) {
    await expect(client.moderator.ratings.adjust(badId, {
      newRating: "mature",
      reason: "Invalid canonical ID check"
    })).rejects.toThrow();
    expect(calls).toBe(0);
  }

  for (const canonicalId of ["booth.pm/ja/items/54321", "pkg?reason=other", "pkg#fragment"]) {
    await expect(client.moderator.ratings.adjust(canonicalId, {
      newRating: "mature",
      reason: "Encoded path segment check"
    })).rejects.toThrow("Fixture transport stop");
    const lastUrl = urls.at(-1)!;
    expect(lastUrl.pathname).toBe(`/v1/moderator/ratings/${encodeURIComponent(canonicalId)}`);
    expect(lastUrl.search).toBe("");
    expect(lastUrl.hash).toBe("");
  }
});
