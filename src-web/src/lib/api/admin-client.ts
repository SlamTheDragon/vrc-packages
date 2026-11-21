import {
	VRCPackageClient,
	VRCPApiError,
	ContentRatingSchema,
	CandidateStatusSchema,
	AppCandidateRecordSchema,
	DelegatedClaimRecordSchema,
	DelegatedClaimListResponseSchema,
	VerifyDelegatedClaimRequestSchema,
	VerifyDelegatedClaimResponseSchema,
	OperatorAppListResponseSchema,
	SetAppDelegationRequestSchema,
	SetAppDelegationResponseSchema,
	ReviewAppCandidateRequestSchema,
	ReviewAppCandidateResponseSchema,
	ModeratorRatingRecordSchema,
	ModeratorRatingListResponseSchema,
	SetRatingAdjustmentRequestSchema,
	SetRatingAdjustmentResponseSchema,
	ModeratorAppListResponseSchema,
	ModeratorReviewAppCandidateRequestSchema,
	ModeratorReviewAppCandidateResponseSchema,
	UmbrellaSchema,
	type VRCPackageClientOptions,
	type PublicCatalogListQuery,
	type PublicCatalogListResponse,
	type CatalogDeltaResponse,
	type SyncDeltasParams,
	type UserAppListQuery,
	type UserAppListResponse,
	type UserAppResponse,
	type InitializeCoordinatorResponse,
	type EnqueueJobRequest,
	type EnqueueJobResponse,
	type LeadStatus,
	type LeadListResponse,
	type LeadActionResponse,
	type SourceAccessProfileListResponse,
	type CreateSourceAccessProfile,
	type SourceAccessProfileResponse,
	type AutoQueueRuleListResponse,
	type CreateAutoQueueRule,
	type AutoQueueRuleResponse,
	type IssueNodeCredential,
	type NodeCredentialResponse,
	type RevokeNodeResponse,
	type CatalogListResponse,
	type TakedownListResponse,
	type VerifyTakedownResponse,
	type ContentRating,
	type CandidateStatus,
	type AppCandidateRecord,
	type DelegatedClaimRecord,
	type DelegatedClaimListResponse,
	type VerifyDelegatedClaimRequest,
	type VerifyDelegatedClaimResponse,
	type OperatorAppListResponse,
	type SetAppDelegationRequest,
	type SetAppDelegationResponse,
	type ReviewAppCandidateRequest,
	type ReviewAppCandidateResponse,
	type ModeratorRatingRecord,
	type ModeratorRatingListResponse,
	type SetRatingAdjustmentRequest,
	type SetRatingAdjustmentResponse,
	type ModeratorAppListResponse,
	type ModeratorReviewAppCandidateRequest,
	type ModeratorReviewAppCandidateResponse,
	type Umbrella
} from 'vrc-packages-api';
import { isOperatorToken, isUserToken, isAppToken } from 'vrc-packages-api/auth';

export {
	VRCPackageClient,
	VRCPApiError,
	ContentRatingSchema,
	CandidateStatusSchema,
	AppCandidateRecordSchema,
	DelegatedClaimRecordSchema,
	DelegatedClaimListResponseSchema,
	VerifyDelegatedClaimRequestSchema,
	VerifyDelegatedClaimResponseSchema,
	OperatorAppListResponseSchema,
	SetAppDelegationRequestSchema,
	SetAppDelegationResponseSchema,
	ReviewAppCandidateRequestSchema,
	ReviewAppCandidateResponseSchema,
	ModeratorRatingRecordSchema,
	ModeratorRatingListResponseSchema,
	SetRatingAdjustmentRequestSchema,
	SetRatingAdjustmentResponseSchema,
	ModeratorAppListResponseSchema,
	ModeratorReviewAppCandidateRequestSchema,
	ModeratorReviewAppCandidateResponseSchema,
	UmbrellaSchema,
	isOperatorToken,
	isUserToken,
	isAppToken
};

export type {
	VRCPackageClientOptions,
	ContentRating,
	CandidateStatus,
	AppCandidateRecord,
	DelegatedClaimRecord,
	DelegatedClaimListResponse,
	VerifyDelegatedClaimRequest,
	VerifyDelegatedClaimResponse,
	OperatorAppListResponse,
	SetAppDelegationRequest,
	SetAppDelegationResponse,
	ReviewAppCandidateRequest,
	ReviewAppCandidateResponse,
	ModeratorRatingRecord,
	ModeratorRatingListResponse,
	SetRatingAdjustmentRequest,
	SetRatingAdjustmentResponse,
	ModeratorAppListResponse,
	ModeratorReviewAppCandidateRequest,
	ModeratorReviewAppCandidateResponse,
	Umbrella
};

export interface PipelineChannelInfo {
	sdkPackage: 'vrc-packages-api-preview';
	sdkChannel: 'preview';
	nativeModeratorSupport: boolean;
	nativeOperatorClaimsSupport: boolean;
	nativeOperatorAppsSupport: boolean;
	previewBridgeActive: boolean;
}

export class VRCPAdminClient {
	readonly sdk: VRCPackageClient;

	constructor(options: VRCPackageClientOptions) {
		this.sdk = new VRCPackageClient(options);
	}

	getPipelineChannelInfo(): PipelineChannelInfo {
		return {
			sdkPackage: 'vrc-packages-api-preview',
			sdkChannel: 'preview',
			nativeModeratorSupport: true,
			nativeOperatorClaimsSupport: true,
			nativeOperatorAppsSupport: true,
			previewBridgeActive: false
		};
	}

	readonly index = {
		query: (params: PublicCatalogListQuery = {}): Promise<PublicCatalogListResponse> =>
			this.sdk.index.query(params),
		syncDeltas: (params: SyncDeltasParams = {}): Promise<CatalogDeltaResponse> =>
			this.sdk.index.syncDeltas(params)
	};

	readonly user = {
		apps: {
			list: (params: Partial<UserAppListQuery> = {}): Promise<UserAppListResponse> =>
				this.sdk.user.apps.list(params),
			get: (appId: string): Promise<UserAppResponse> => this.sdk.user.apps.get(appId)
		}
	};

	readonly operator = {
		init: (params: { autoSeed?: boolean } = {}): Promise<InitializeCoordinatorResponse> =>
			this.sdk.operator.init(params),
		jobs: {
			enqueue: (request: EnqueueJobRequest): Promise<EnqueueJobResponse> =>
				this.sdk.operator.jobs.enqueue(request)
		},
		leads: {
			list: (
				params: { status?: LeadStatus; limit?: number; cursor?: string } = {}
			): Promise<LeadListResponse> => this.sdk.operator.leads.list(params),
			approve: (
				leadKey: string,
				params: { minDelayMs?: number; reason: string }
			): Promise<LeadActionResponse> => this.sdk.operator.leads.approve(leadKey, params),
			reject: (leadKey: string, params: { reason: string }): Promise<LeadActionResponse> =>
				this.sdk.operator.leads.reject(leadKey, params)
		},
		sourceProfiles: {
			list: (params: { limit?: number; cursor?: string } = {}): Promise<SourceAccessProfileListResponse> =>
				this.sdk.operator.sourceProfiles.list(params),
			create: (request: CreateSourceAccessProfile): Promise<SourceAccessProfileResponse> =>
				this.sdk.operator.sourceProfiles.create(request),
			disable: (profileId: string, reason: string): Promise<SourceAccessProfileResponse> =>
				this.sdk.operator.sourceProfiles.disable(profileId, reason)
		},
		autoQueueRules: {
			list: (params: { limit?: number; cursor?: string } = {}): Promise<AutoQueueRuleListResponse> =>
				this.sdk.operator.autoQueueRules.list(params),
			create: (request: CreateAutoQueueRule): Promise<AutoQueueRuleResponse> =>
				this.sdk.operator.autoQueueRules.create(request),
			disable: (ruleId: string, reason: string): Promise<AutoQueueRuleResponse> =>
				this.sdk.operator.autoQueueRules.disable(ruleId, reason)
		},
		nodes: {
			issue: (request: IssueNodeCredential): Promise<NodeCredentialResponse> =>
				this.sdk.operator.nodes.issue(request),
			revoke: (nodeId: string, reason: string): Promise<RevokeNodeResponse> =>
				this.sdk.operator.nodes.revoke(nodeId, reason)
		},
		catalog: {
			list: (params: { limit?: number; cursor?: string } = {}): Promise<CatalogListResponse> =>
				this.sdk.operator.catalog.list(params)
		},
		takedowns: {
			list: (
				params: {
					requesterType?: 'unauthenticated_creator' | 'user' | 'admin_operator';
					limit?: number;
					cursor?: string;
				} = {}
			): Promise<TakedownListResponse> => this.sdk.operator.takedowns.list(params),
			verify: (
				takedownId: string,
				request: { verdict: 'accepted' | 'rejected'; notes?: string }
			): Promise<VerifyTakedownResponse> => this.sdk.operator.takedowns.verify(takedownId, request)
		},
		claims: {
			list: (
				params: {
					reviewStatus?: 'pending' | 'accepted' | 'rejected';
					limit?: number;
					cursor?: string;
				} = {}
			): Promise<DelegatedClaimListResponse> => this.sdk.operator.claims.list(params),
			verify: (
				claimId: string,
				request: { verdict: 'accepted' | 'rejected'; notes?: string }
			): Promise<VerifyDelegatedClaimResponse> => this.sdk.operator.claims.verify(claimId, request)
		},
		apps: {
			list: (
				params: { limit?: number; cursor?: string; candidateStatus?: CandidateStatus } = {}
			): Promise<OperatorAppListResponse> => this.sdk.operator.apps.list(params),
			setDelegation: (
				appId: string,
				request: { delegationAllowed: boolean; reason?: string }
			): Promise<SetAppDelegationResponse> => this.sdk.operator.apps.setDelegation(appId, request),
			reviewCandidate: (
				appId: string,
				request: {
					candidateStatus: 'none' | 'reviewed' | 'trusted';
					grantDelegation?: boolean;
					notes?: string;
				}
			): Promise<ReviewAppCandidateResponse> => this.sdk.operator.apps.reviewCandidate(appId, request)
		}
	};

	readonly moderator = {
		ratings: {
			list: (
				params: { rating?: ContentRating; limit?: number; cursor?: string } = {}
			): Promise<ModeratorRatingListResponse> => this.sdk.moderator.ratings.list(params),
			adjust: (
				canonicalId: string,
				request: { newRating: ContentRating; reason: string }
			): Promise<SetRatingAdjustmentResponse> =>
				this.sdk.moderator.ratings.adjust(canonicalId, request)
		},
		apps: {
			list: (
				params: { limit?: number; cursor?: string; candidateStatus?: CandidateStatus } = {}
			): Promise<ModeratorAppListResponse> => this.sdk.moderator.apps.list(params),
			reviewCandidate: (
				appId: string,
				request: {
					candidateStatus: 'none' | 'reviewed' | 'trusted';
					grantDelegation?: boolean;
					notes?: string;
				}
			): Promise<ModeratorReviewAppCandidateResponse> =>
				this.sdk.moderator.apps.reviewCandidate(appId, request)
		}
	};
}
