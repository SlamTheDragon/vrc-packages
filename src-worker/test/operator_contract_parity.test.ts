import { describe, expect, test } from "bun:test";
import {
  ApproveLeadSchema,
  RejectLeadSchema,
  LeadRowSchema,
  VRCPackageClient
} from "vrc-packages-api";

const wireLead = {
  lead_key: "a".repeat(64),
  kind: "vpm_listing" as const,
  target_url: "https://publisher.example/index.json",
  claimed_package_id: null,
  discovered_from_url: "https://directory.example/catalog",
  discovered_from_item_key: null,
  status: "pending_review" as const,
  first_seen_at: "2026-10-03T00:00:00.000Z",
  last_seen_at: "2026-10-03T00:00:00.000Z"
};

describe("strict operator lead contract parity", () => {
  test("SDK and Worker preserve the exact wire row without aliases", () => {
    expect(LeadRowSchema.parse(wireLead)).toEqual(wireLead);
  });

  test("rejects aliases, extra fields and missing provenance", () => {
    const { discovered_from_url: _origin, ...withoutOrigin } = wireLead;
    const camel = {
      leadKey: wireLead.lead_key,
      leadKind: wireLead.kind,
      targetUrl: wireLead.target_url,
      status: wireLead.status,
      firstSeenAt: wireLead.first_seen_at,
      lastSeenAt: wireLead.last_seen_at
    };
    for (const input of [
      camel,
      withoutOrigin,
      { ...wireLead, discovered_from_url: null },
      { ...wireLead, unexpected: true },
      { ...wireLead, leadKey: wireLead.lead_key }
    ]) {
      expect(LeadRowSchema.safeParse(input).success).toBe(false);
    }
  });

  test("row validation matches the existing Worker opaque-key policy", () => {
    const input = { ...wireLead, lead_key: "opaque-key" };
    expect(LeadRowSchema.parse(input)).toEqual(input);
  });

  test("requires explicit valid audit reasons and rejects unknown fields", () => {
    for (const input of [
      { schemaVersion: 1 },
      ...["", "  ", "ab"].map((reason) => ({ schemaVersion: 1, reason })),
      { schemaVersion: 1, reason: "Reviewed listing", extra: true }
    ]) {
      for (const schema of [ApproveLeadSchema, RejectLeadSchema]) {
        expect(schema.safeParse(input).success).toBe(false);
      }
    }
  });

  test("SDK serializes explicit reasons without supplying defaults", async () => {
    const requests: unknown[] = [];
    const client = new VRCPackageClient({
      baseUrl: "https://worker.example",
      operatorToken: "b".repeat(64),
      fetch: Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          const body: unknown = await request.json();
          requests.push(body);
          const approve = new URL(request.url).pathname.endsWith("/approve");
          expect((approve ? ApproveLeadSchema : RejectLeadSchema).safeParse(body).success).toBe(true);
          return Response.json({
            schemaVersion: 1,
            leadKey: wireLead.lead_key,
            status: approve ? "approved" : "rejected",
            ...(approve ? { jobId: "00000000-0000-4000-8000-000000000001" } : {})
          });
        },
        { preconnect() {} }
      )
    });
    await client.operator.leads.approve(wireLead.lead_key, { reason: "Reviewed approval" });
    await client.operator.leads.reject(wireLead.lead_key, { reason: "Reviewed rejection" });
    expect(requests).toEqual([
      { schemaVersion: 1, reason: "Reviewed approval" },
      { schemaVersion: 1, reason: "Reviewed rejection" }
    ]);
  });
});
