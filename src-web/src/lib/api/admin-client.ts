import { z } from 'zod';
import {
	VRCPackageClient,
	VRCPApiError,
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
	UmbrellaSchema
} from 'vrc-packages-api';
import { isOperatorToken, isUserToken, isAppToken } from 'vrc-packages-api/auth';

export { VRCPackageClient, VRCPApiError, isOperatorToken, isUserToken, isAppToken };

export const ContentRatingSchema = z.enum([
	'general',
	'mature',
	'sexual_suggestive',
	'adult_restricted',
	'unknown_restricted',
	'prohibited'
]);
export type ContentRating = z.infer<typeof ContentRatingSchema>;

export const CandidateStatusSchema = z.enum(['none', 'review_pending', 'reviewed', 'trusted']);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const AppCandidateRecordSchema = z.strictObject({
	appId: z.uuid(),
	appName: z.string().min(1).max(100),
	contactEmail: z.string().nullable().optional(),
	permissions: z.array(z.string()),
	delegationAllowed: z.boolean(),
	requestCount: z.number().int().min(0).default(0),
	lastActiveAt: z.string().nullable().optional(),
	candidateStatus: CandidateStatusSchema.default('none'),
	candidateFlags: z.array(z.string()).default([]),
	createdAt: z.string(),
	revokedAt: z.string().nullable()
});
export type AppCandidateRecord = z.infer<typeof AppCandidateRecordSchema>;

export const AppCandidateListResponseSchema = z.strictObject({
	schemaVersion: z.literal(1),
	apps: z.array(AppCandidateRecordSchema),
	nextCursor: z.string().nullable()
});
export type AppCandidateListResponse = z.infer<typeof AppCandidateListResponseSchema>;

export const ReviewAppCandidateRequestSchema = z.strictObject({
	schemaVersion: z.literal(1),
	candidateStatus: z.enum(['none', 'reviewed', 'trusted']),
	grantDelegation: z.boolean().optional(),
	notes: z.string().trim().min(1).max(500).optional()
});
export type ReviewAppCandidateRequest = z.infer<typeof ReviewAppCandidateRequestSchema>;

export const ReviewAppCandidateResponseSchema = z.strictObject({
	schemaVersion: z.literal(1),
	appId: z.uuid(),
	candidateStatus: CandidateStatusSchema,
	candidateFlags: z.array(z.string()),
	delegationAllowed: z.boolean(),
	permissions: z.array(z.string()),
	reviewedAt: z.string()
});
export type ReviewAppCandidateResponse = z.infer<typeof ReviewAppCandidateResponseSchema>;

export const SetAppDelegationRequestSchema = z.strictObject({
	schemaVersion: z.literal(1),
	delegationAllowed: z.boolean(),
	reason: z.string().trim().min(1).max(300).optional()
});
export type SetAppDelegationRequest = z.infer<typeof SetAppDelegationRequestSchema>;

export const SetAppDelegationResponseSchema = z.strictObject({
	schemaVersion: z.literal(1),
	appId: z.uuid(),
	delegationAllowed: z.boolean(),
	permissions: z.array(z.string()),
	updatedAt: z.string()
});
export type SetAppDelegationResponse = z.infer<typeof SetAppDelegationResponseSchema>;

export const DelegatedClaimRecordSchema = z.strictObject({
	claimId: z.uuid(),
	appId: z.uuid(),
	action: z.literal('creator_ownership_claim'),
	frontUrl: z.string(),
	creatorId: z.string(),
	challengeToken: z.string(),
	expiresAt: z.number().int(),
	nonce: z.string(),
	signature: z.string(),
	reason: z.string().nullable().optional(),
	contactEmail: z.string().nullable().optional(),
	reviewStatus: z.enum(['pending', 'accepted', 'rejected']),
	reviewNotes: z.string().nullable().optional(),
	recordedAt: z.string()
});
export type DelegatedClaimRecord = z.infer<typeof DelegatedClaimRecordSchema>;

export const DelegatedClaimListResponseSchema = z.strictObject({
	schemaVersion: z.literal(1),
	records: z.array(DelegatedClaimRecordSchema),
	nextCursor: z.string().nullable()
});
export type DelegatedClaimListResponse = z.infer<typeof DelegatedClaimListResponseSchema>;

export const VerifyDelegatedClaimRequestSchema = z.strictObject({
	schemaVersion: z.literal(1),
	verdict: z.enum(['accepted', 'rejected']),
	notes: z.string().trim().max(1000).optional()
});
export type VerifyDelegatedClaimRequest = z.infer<typeof VerifyDelegatedClaimRequestSchema>;

export const VerifyDelegatedClaimResponseSchema = z.strictObject({
	schemaVersion: z.literal(1),
	claimId: z.uuid(),
	status: z.enum(['accepted', 'rejected']),
	updatedAt: z.string()
});
export type VerifyDelegatedClaimResponse = z.infer<typeof VerifyDelegatedClaimResponseSchema>;

export const ModeratorRatingRecordSchema = z.strictObject({
	canonicalId: z.string().min(1).max(500),
	displayName: z.string(),
	currentRating: ContentRatingSchema,
	umbrella: UmbrellaSchema,
	category: z.string(),
	reportCount: z.number().int().min(0),
	updatedAt: z.string()
});
export type ModeratorRatingRecord = z.infer<typeof ModeratorRatingRecordSchema>;

export const ModeratorRatingListResponseSchema = z.strictObject({
	schemaVersion: z.literal(1),
	ratings: z.array(ModeratorRatingRecordSchema),
	nextCursor: z.string().nullable()
});
export type ModeratorRatingListResponse = z.infer<typeof ModeratorRatingListResponseSchema>;

export const SetRatingAdjustmentRequestSchema = z.strictObject({
	schemaVersion: z.literal(1),
	newRating: ContentRatingSchema,
	reason: z.string().trim().min(3).max(300)
});
export type SetRatingAdjustmentRequest = z.infer<typeof SetRatingAdjustmentRequestSchema>;

export const SetRatingAdjustmentResponseSchema = z.strictObject({
	schemaVersion: z.literal(1),
	canonicalId: z.string().min(1).max(500),
	previousRating: ContentRatingSchema,
	newRating: ContentRatingSchema,
	adjustedBy: z.string(),
	updatedAt: z.string()
});
export type SetRatingAdjustmentResponse = z.infer<typeof SetRatingAdjustmentResponseSchema>;

export interface PipelineChannelInfo {
	sdkPackage: 'vrc-packages-api';
	sdkChannel: 'release';
	nativeModeratorSupport: boolean;
	nativeOperatorClaimsSupport: boolean;
	nativeOperatorAppsSupport: boolean;
	previewBridgeActive: boolean;
}

export class VRCPAdminClient {
	readonly sdk: VRCPackageClient;
	private readonly baseUrl: string;
	private readonly operatorToken?: string;
	private readonly userToken?: string;
	private readonly fetchFn: typeof fetch;

	constructor(options: VRCPackageClientOptions) {
		const customFetch = options.fetch ?? globalThis.fetch;
		const boundFetch: typeof fetch = (input, init) => customFetch(input, init);
		this.fetchFn = boundFetch;
		this.sdk = new VRCPackageClient({ ...options, fetch: boundFetch });
		this.baseUrl = options.baseUrl.replace(/\/+$/, '');
		this.operatorToken = options.operatorToken;
		this.userToken = options.userToken;
	}

	getPipelineChannelInfo(): PipelineChannelInfo {
		const sdkAny = this.sdk as unknown as Record<string, unknown>;
		const opAny = this.sdk.operator as unknown as Record<string, unknown>;
		const nativeModeratorSupport = typeof sdkAny.moderator === 'object' && sdkAny.moderator !== null;
		const nativeOperatorClaimsSupport = typeof opAny.claims === 'object' && opAny.claims !== null;
		const nativeOperatorAppsSupport = typeof opAny.apps === 'object' && opAny.apps !== null;
		return {
			sdkPackage: 'vrc-packages-api',
			sdkChannel: 'release',
			nativeModeratorSupport,
			nativeOperatorClaimsSupport,
			nativeOperatorAppsSupport,
			previewBridgeActive:
				!nativeModeratorSupport || !nativeOperatorClaimsSupport || !nativeOperatorAppsSupport
		};
	}

	private async bridgeRequest<T>(
		path: string,
		method: 'GET' | 'POST',
		schema: z.ZodType<T>,
		options: {
			auth: 'operator' | 'user';
			queryParams?: Record<string, string | number | undefined>;
			body?: unknown;
		}
	): Promise<T> {
		const url = new URL(`${this.baseUrl}${path}`);
		if (options.queryParams) {
			for (const [key, val] of Object.entries(options.queryParams)) {
				if (val !== undefined && val !== null && val !== '') {
					url.searchParams.set(key, String(val));
				}
			}
		}

		const headers: Record<string, string> = {
			Accept: 'application/json'
		};

		if (options.auth === 'operator') {
			if (!this.operatorToken) {
				throw new VRCPApiError(401, 'Operator token required for this endpoint');
			}
			headers.Authorization = `Bearer ${this.operatorToken}`;
		} else {
			if (!this.userToken) {
				throw new VRCPApiError(401, 'User token (vrcp_usr_) required for this endpoint');
			}
			headers.Authorization = `Bearer ${this.userToken}`;
		}

		let requestBody: string | undefined;
		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json';
			requestBody = JSON.stringify(options.body);
		}

		const response = await this.fetchFn(url.toString(), {
			method,
			headers,
			body: requestBody
		});

		const text = await response.text();
		if (!response.ok) {
			let parsed: unknown = text;
			try {
				parsed = JSON.parse(text);
			} catch {
				// preserve raw text
			}
			const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
			const message =
				typeof record?.message === 'string'
					? record.message
					: typeof record?.error === 'string'
						? record.error
						: `Request failed with status ${response.status}`;
			const code =
				typeof record?.code === 'string'
					? record.code
					: typeof record?.error === 'string'
						? record.error
						: undefined;
			throw new VRCPApiError(response.status, message, code, parsed);
		}

		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			throw new VRCPApiError(
				response.status,
				`Invalid JSON response received with status ${response.status}`,
				'invalid_json',
				text
			);
		}

		return schema.parse(json);
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
			list: async (
				params: {
					reviewStatus?: 'pending' | 'accepted' | 'rejected';
					limit?: number;
					cursor?: string;
				} = {}
			): Promise<DelegatedClaimListResponse> => {
				const opAny = this.sdk.operator as unknown as {
					claims?: { list?: (p: typeof params) => Promise<DelegatedClaimListResponse> };
				};
				if (typeof opAny.claims?.list === 'function') {
					return opAny.claims.list(params);
				}
				return this.bridgeRequest('/v1/operator/claims', 'GET', DelegatedClaimListResponseSchema, {
					auth: 'operator',
					queryParams: {
						reviewStatus: params.reviewStatus,
						limit: params.limit ?? 50,
						cursor: params.cursor
					}
				});
			},
			verify: async (
				claimId: string,
				request: { verdict: 'accepted' | 'rejected'; notes?: string }
			): Promise<VerifyDelegatedClaimResponse> => {
				const opAny = this.sdk.operator as unknown as {
					claims?: {
						verify?: (id: string, req: typeof request) => Promise<VerifyDelegatedClaimResponse>;
					};
				};
				if (typeof opAny.claims?.verify === 'function') {
					return opAny.claims.verify(claimId, request);
				}
				const id = z.uuid().parse(claimId).toLowerCase();
				const body = VerifyDelegatedClaimRequestSchema.parse({
					schemaVersion: 1,
					verdict: request.verdict,
					notes: request.notes
				});
				return this.bridgeRequest(
					`/v1/operator/claims/${id}/verify`,
					'POST',
					VerifyDelegatedClaimResponseSchema,
					{
						auth: 'operator',
						body
					}
				);
			}
		},
		apps: {
			list: async (
				params: { limit?: number; cursor?: string; candidateStatus?: CandidateStatus } = {}
			): Promise<AppCandidateListResponse> => {
				const opAny = this.sdk.operator as unknown as {
					apps?: { list?: (p: typeof params) => Promise<AppCandidateListResponse> };
				};
				if (typeof opAny.apps?.list === 'function') {
					return opAny.apps.list(params);
				}
				return this.bridgeRequest('/v1/operator/apps', 'GET', AppCandidateListResponseSchema, {
					auth: 'operator',
					queryParams: {
						limit: params.limit ?? 50,
						cursor: params.cursor,
						candidateStatus: params.candidateStatus
					}
				});
			},
			setDelegation: async (
				appId: string,
				request: { delegationAllowed: boolean; reason?: string }
			): Promise<SetAppDelegationResponse> => {
				const opAny = this.sdk.operator as unknown as {
					apps?: {
						setDelegation?: (id: string, req: typeof request) => Promise<SetAppDelegationResponse>;
					};
				};
				if (typeof opAny.apps?.setDelegation === 'function') {
					return opAny.apps.setDelegation(appId, request);
				}
				const id = z.uuid().parse(appId).toLowerCase();
				const body = SetAppDelegationRequestSchema.parse({
					schemaVersion: 1,
					delegationAllowed: request.delegationAllowed,
					reason: request.reason
				});
				return this.bridgeRequest(
					`/v1/operator/apps/${id}/delegation`,
					'POST',
					SetAppDelegationResponseSchema,
					{
						auth: 'operator',
						body
					}
				);
			},
			reviewCandidate: async (
				appId: string,
				request: {
					candidateStatus: 'none' | 'reviewed' | 'trusted';
					grantDelegation?: boolean;
					notes?: string;
				}
			): Promise<ReviewAppCandidateResponse> => {
				const opAny = this.sdk.operator as unknown as {
					apps?: {
						reviewCandidate?: (
							id: string,
							req: typeof request
						) => Promise<ReviewAppCandidateResponse>;
					};
				};
				if (typeof opAny.apps?.reviewCandidate === 'function') {
					return opAny.apps.reviewCandidate(appId, request);
				}
				const id = z.uuid().parse(appId).toLowerCase();
				const body = ReviewAppCandidateRequestSchema.parse({
					schemaVersion: 1,
					candidateStatus: request.candidateStatus,
					grantDelegation: request.grantDelegation,
					notes: request.notes
				});
				return this.bridgeRequest(
					`/v1/operator/apps/${id}/candidate-review`,
					'POST',
					ReviewAppCandidateResponseSchema,
					{
						auth: 'operator',
						body
					}
				);
			}
		}
	};

	readonly moderator = {
		ratings: {
			list: async (
				params: { rating?: ContentRating; limit?: number; cursor?: string } = {}
			): Promise<ModeratorRatingListResponse> => {
				const sdkAny = this.sdk as unknown as {
					moderator?: {
						ratings?: { list?: (p: typeof params) => Promise<ModeratorRatingListResponse> };
					};
				};
				if (typeof sdkAny.moderator?.ratings?.list === 'function') {
					return sdkAny.moderator.ratings.list(params);
				}
				return this.bridgeRequest('/v1/moderator/ratings', 'GET', ModeratorRatingListResponseSchema, {
					auth: 'user',
					queryParams: {
						rating: params.rating,
						limit: params.limit ?? 50,
						cursor: params.cursor
					}
				});
			},
			adjust: async (
				canonicalId: string,
				request: { newRating: ContentRating; reason: string }
			): Promise<SetRatingAdjustmentResponse> => {
				const sdkAny = this.sdk as unknown as {
					moderator?: {
						ratings?: {
							adjust?: (id: string, req: typeof request) => Promise<SetRatingAdjustmentResponse>;
						};
					};
				};
				if (typeof sdkAny.moderator?.ratings?.adjust === 'function') {
					return sdkAny.moderator.ratings.adjust(canonicalId, request);
				}
				const trimmed = canonicalId.trim();
				if (!trimmed || trimmed === '.' || trimmed === '..') {
					throw new VRCPApiError(400, 'Canonical package ID cannot be blank, ".", or ".."');
				}
				const body = SetRatingAdjustmentRequestSchema.parse({
					schemaVersion: 1,
					newRating: request.newRating,
					reason: request.reason
				});
				return this.bridgeRequest(
					`/v1/moderator/ratings/${encodeURIComponent(trimmed)}`,
					'POST',
					SetRatingAdjustmentResponseSchema,
					{
						auth: 'user',
						body
					}
				);
			}
		},
		apps: {
			list: async (
				params: { limit?: number; cursor?: string; candidateStatus?: CandidateStatus } = {}
			): Promise<AppCandidateListResponse> => {
				const sdkAny = this.sdk as unknown as {
					moderator?: {
						apps?: { list?: (p: typeof params) => Promise<AppCandidateListResponse> };
					};
				};
				if (typeof sdkAny.moderator?.apps?.list === 'function') {
					return sdkAny.moderator.apps.list(params);
				}
				return this.bridgeRequest('/v1/moderator/apps', 'GET', AppCandidateListResponseSchema, {
					auth: 'user',
					queryParams: {
						limit: params.limit ?? 50,
						cursor: params.cursor,
						candidateStatus: params.candidateStatus
					}
				});
			},
			reviewCandidate: async (
				appId: string,
				request: {
					candidateStatus: 'none' | 'reviewed' | 'trusted';
					grantDelegation?: boolean;
					notes?: string;
				}
			): Promise<ReviewAppCandidateResponse> => {
				const sdkAny = this.sdk as unknown as {
					moderator?: {
						apps?: {
							reviewCandidate?: (
								id: string,
								req: typeof request
							) => Promise<ReviewAppCandidateResponse>;
						};
					};
				};
				if (typeof sdkAny.moderator?.apps?.reviewCandidate === 'function') {
					return sdkAny.moderator.apps.reviewCandidate(appId, request);
				}
				const id = z.uuid().parse(appId).toLowerCase();
				const body = ReviewAppCandidateRequestSchema.parse({
					schemaVersion: 1,
					candidateStatus: request.candidateStatus,
					grantDelegation: request.grantDelegation,
					notes: request.notes
				});
				return this.bridgeRequest(
					`/v1/moderator/apps/${id}/candidate-review`,
					'POST',
					ReviewAppCandidateResponseSchema,
					{
						auth: 'user',
						body
					}
				);
			}
		}
	};
}
