import { expect, test } from "bun:test";
import * as sdk from "../src/index.ts";
import * as protocol from "../src/protocol/index.ts";
import * as types from "../src/types/index.ts";
import * as user from "../src/protocol/user.ts";
import * as downstream from "../src/protocol/downstream.ts";

test("SDK exports use owner-approved VRCP identity without old-name aliases", () => {
  expect(typeof sdk.VRCPackageClient).toBe("function");
  expect(typeof sdk.VRCPApiError).toBe("function");
  for (const name of ["VrcPackagesClient", "VrcApiError", "VRCPPackageClient", "VRCPPackagesClient"]) {
    expect(Object.hasOwn(sdk, name)).toBe(false);
  }
  const error = new sdk.VRCPApiError(403, "Fixture rejection", "forbidden");
  expect(error.name).toBe("VRCPApiError");
  expect(error.status).toBe(403);
  expect(error.code).toBe("forbidden");
});

test("SDK entry points do not expose retired direct-delisting or deprecated feedback contracts", () => {
  for (const entry of [sdk, protocol, user, downstream]) {
    for (const name of [
      "DelistRequestSchema",
      "DelistResponseSchema",
      "DelistProofKindSchema",
      "FeedbackSignalTypeSchema",
      "DownstreamFeedbackRequestSchema",
      "DownstreamFeedbackResponseSchema"
    ]) {
      expect(Object.hasOwn(entry, name)).toBe(false);
    }
  }
  expect(sdk.ReportSubmissionRequestSchema.safeParse({
    schemaVersion: 1,
    reportType: "removal_request",
    canonicalId: "fixture-package",
    reason: "Review attribution"
  }).success).toBe(true);
});

test("SDK entry points purge legacy curated, identity link, source profile, and auto-queue contracts", () => {
  for (const entry of [sdk, protocol, types]) {
    for (const name of [
      "CatalogIdentityLinkSchema",
      "CreateSourceAccessProfileSchema",
      "SourceAccessProfileSchema",
      "DisableSourceAccessProfileSchema",
      "SourceAccessProfileResponseSchema",
      "SourceAccessProfileListResponseSchema",
      "ProfileCursorSchema",
      "encodeProfileCursor",
      "decodeProfileCursor",
      "OperatorProfileListQuerySchema",
      "AutoQueueRuleSchema",
      "CreateAutoQueueRuleSchema",
      "DisableAutoQueueRuleSchema",
      "AutoQueueRuleListResponseSchema",
      "AutoQueueRuleResponseSchema",
      "RuleCursorSchema",
      "encodeRuleCursor",
      "decodeRuleCursor",
      "OperatorRuleListQuerySchema"
    ]) {
      expect(Object.hasOwn(entry, name)).toBe(false);
    }
  }
  expect(sdk.PlatformSchema.options).toHaveLength(9);
  expect(sdk.PlatformSchema.safeParse("curated").success).toBe(false);
  const client = new sdk.VRCPackageClient({ baseUrl: "https://worker.example" });
  expect("sourceProfiles" in client.operator).toBe(false);
  expect("autoQueueRules" in client.operator).toBe(false);
});
