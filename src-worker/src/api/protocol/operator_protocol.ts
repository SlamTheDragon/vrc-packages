import { z } from "zod";
import * as sdk from "vrc-packages-api";

export const OPERATOR_API_JSON_SCHEMAS = {
  approveLead: z.toJSONSchema(sdk.ApproveLeadSchema),
  rejectLead: z.toJSONSchema(sdk.RejectLeadSchema),
  leadListResponse: z.toJSONSchema(sdk.LeadListResponseSchema),
  leadActionResponse: z.toJSONSchema(sdk.LeadActionResponseSchema),
  createAutoQueueRule: z.toJSONSchema(sdk.CreateAutoQueueRuleSchema),
  disableAutoQueueRule: z.toJSONSchema(sdk.DisableAutoQueueRuleSchema),
  autoQueueRuleListResponse: z.toJSONSchema(sdk.AutoQueueRuleListResponseSchema),
  autoQueueRuleResponse: z.toJSONSchema(sdk.AutoQueueRuleResponseSchema),
  issueNodeCredential: z.toJSONSchema(sdk.IssueNodeCredentialSchema),
  nodeCredentialResponse: z.toJSONSchema(sdk.NodeCredentialResponseSchema),
  operatorNodeListResponse: z.toJSONSchema(sdk.OperatorNodeListResponseSchema),
  operatorJobListResponse: z.toJSONSchema(sdk.OperatorJobListResponseSchema),
  catalogListResponse: z.toJSONSchema(sdk.CatalogListResponseSchema),
  takedownListResponse: z.toJSONSchema(sdk.TakedownListResponseSchema),
  verifyTakedownRequest: z.toJSONSchema(sdk.VerifyTakedownRequestSchema),
  verifyTakedownResponse: z.toJSONSchema(sdk.VerifyTakedownResponseSchema),
  delegatedClaimListResponse: z.toJSONSchema(sdk.DelegatedClaimListResponseSchema),
  verifyDelegatedClaimRequest: z.toJSONSchema(sdk.VerifyDelegatedClaimRequestSchema),
  verifyDelegatedClaimResponse: z.toJSONSchema(sdk.VerifyDelegatedClaimResponseSchema),
  operatorAppListResponse: z.toJSONSchema(sdk.OperatorAppListResponseSchema),
  setAppDelegationRequest: z.toJSONSchema(sdk.SetAppDelegationRequestSchema),
  setAppDelegationResponse: z.toJSONSchema(sdk.SetAppDelegationResponseSchema),
  reviewAppCandidateRequest: z.toJSONSchema(sdk.ReviewAppCandidateRequestSchema),
  reviewAppCandidateResponse: z.toJSONSchema(sdk.ReviewAppCandidateResponseSchema)
};
