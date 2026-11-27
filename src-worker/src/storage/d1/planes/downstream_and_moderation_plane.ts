import {
  CreatorClaimIntakeRequestSchema,
  RegisterAppRequestSchema,
  ReportSubmissionRequestSchema,
  UserAppListQuerySchema,
  UserAppSchema,
  encodeModeratorRatingCursor,
  type ContentRating,
  type CreatorClaimIntakeRequest,
  type CreatorClaimIntakeResponse,
  type ModeratorRatingRecord,
  type RegisterAppRequest,
  type RegisterAppResponse,
  type ReportSubmissionRequest,
  type ReportSubmissionResponse,
  type UserAppListResponse
} from "vrc-packages-api";
import { formatAppToken, formatUserToken, isAppToken, isUserToken } from "vrc-packages-api/auth";
import { CoordinatorConflict, type DownstreamAppPrincipal, type UserPrincipal } from "../../../domain/ports/stores.ts";
import { generateToken, sha256Hex } from "../../../domain/security/crypto_primitives.ts";
import type { D1PreparedStatement } from "../definitions.ts";
import { D1PlaneContext } from "./shared_context.ts";

export class DownstreamAndModerationPlane {
  constructor(private readonly ctx: D1PlaneContext) {}

  async recordReportSubmission(appId: string, input: ReportSubmissionRequest): Promise<ReportSubmissionResponse> {
    const parsed = ReportSubmissionRequestSchema.parse(input);
    const reportId = crypto.randomUUID();
    const recordedAt = new Date(this.ctx.now()).toISOString();

    const activeApp = await this.ctx.db
      .prepare("SELECT app_id FROM registered_apps WHERE app_id = ? AND revoked_at IS NULL")
      .bind(appId)
      .first<{ app_id: string }>();
    if (!activeApp) {
      throw new CoordinatorConflict("Invalid application credential", 403);
    }

    if (parsed.reportType === "demand_signal") {
      const signalType = parsed.signalKind ?? (parsed.canonicalId ? "refresh_demand" : "search_miss");
      const targetUrl = parsed.targetUrl ? new URL(parsed.targetUrl).href : null;
      await this.ctx.db
        .prepare(
          `INSERT INTO downstream_signals(
             signal_id, app_id, signal_type, query, zero_hits, requested_platform,
             target_url, target_canonical_id, related_canonical_id, category, metadata_json, recorded_at, resolved_at
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, NULL)`
        )
        .bind(
          reportId,
          appId,
          signalType,
          parsed.query ?? null,
          parsed.zeroHits ? 1 : 0,
          targetUrl,
          parsed.canonicalId ?? null,
          parsed.metadata ? JSON.stringify(parsed.metadata) : null,
          recordedAt
        )
        .run();
      return { schemaVersion: 1, status: "accepted", reportId, recordedAt };
    }

    if (parsed.reportType === "relationship_feedback") {
      const stmts: D1PreparedStatement[] = [
        this.ctx.db
          .prepare(
            `INSERT INTO downstream_signals(
               signal_id, app_id, signal_type, query, zero_hits, requested_platform,
               target_url, target_canonical_id, related_canonical_id, category, metadata_json, recorded_at, resolved_at
             ) VALUES (?, ?, 'relationship_feedback', NULL, 0, NULL, NULL, ?, ?, NULL, ?, ?, ?)`
          )
          .bind(
            reportId,
            appId,
            parsed.canonicalId,
            parsed.relatedCanonicalId ?? null,
            JSON.stringify({
              targetAvatarBase: parsed.targetAvatarBase ?? null,
              relationType: parsed.relationType,
              vote: parsed.vote,
              reason: parsed.reason ?? null,
              metadata: parsed.metadata ?? null
            }),
            recordedAt,
            recordedAt
          )
      ];

      const counterColumn = parsed.vote === "up" ? "feedback_up_count" : "feedback_down_count";
      const matchClauses = ["source_canonical_id = ?", "relation_type = ?"];
      const matchParams: unknown[] = [parsed.canonicalId, parsed.relationType];
      if (parsed.relatedCanonicalId !== undefined) {
        matchClauses.push("target_canonical_id = ?");
        matchParams.push(parsed.relatedCanonicalId);
      }
      if (parsed.targetAvatarBase !== undefined) {
        matchClauses.push("target_avatar_base = ?");
        matchParams.push(parsed.targetAvatarBase);
      }

      stmts.push(
        this.ctx.db
          .prepare(
            `UPDATE listing_relations
             SET ${counterColumn} = ${counterColumn} + 1, updated_at = ?
             WHERE ${matchClauses.join(" AND ")}`
          )
          .bind(recordedAt, ...matchParams)
      );

      await this.ctx.executeBatchChunked(stmts);
      return { schemaVersion: 1, status: "accepted", reportId, recordedAt };
    }

    if (parsed.reportType === "removal_request") {
      const targetUrl = parsed.targetUrl ? new URL(parsed.targetUrl).href : null;
      await this.ctx.db
        .prepare(
          `INSERT INTO catalog_tickets(
             ticket_id, ticket_type, app_id, target_url, canonical_id, requester_type,
             reason, payload_json, review_status, recorded_at
           ) VALUES (?, 'removal_report', ?, ?, ?, 'app', ?, ?, 'pending', ?)`
        )
        .bind(
          reportId,
          appId,
          targetUrl,
          parsed.canonicalId ?? null,
          parsed.reason,
          JSON.stringify(parsed),
          recordedAt
        )
        .run();
      return { schemaVersion: 1, status: "accepted", reportId, recordedAt };
    }

    const targetUrl = parsed.targetUrl ? new URL(parsed.targetUrl).href : null;
    let ticketType: "metadata_issue" | "rating_dispute" | "safety_quarantine" = "metadata_issue";
    if (
      parsed.reportKind === "explicit_false_positive" ||
      parsed.reportKind === "explicit_false_negative" ||
      parsed.reportKind === "misclassified"
    ) {
      ticketType = "rating_dispute";
    } else if (parsed.reportKind === "inappropriate") {
      ticketType = "safety_quarantine";
    }

    await this.ctx.db
      .prepare(
        `INSERT INTO catalog_tickets(
           ticket_id, ticket_type, app_id, target_url, canonical_id,
           reason, payload_json, review_status, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .bind(
        reportId,
        ticketType,
        appId,
        targetUrl,
        parsed.canonicalId ?? null,
        parsed.reason ?? parsed.reportKind,
        JSON.stringify(parsed),
        recordedAt
      )
      .run();

    return { schemaVersion: 1, status: "accepted", reportId, recordedAt };
  }

  async listUserApps(
    userId: string,
    limit: number,
    cursor: string | null,
    appId?: string
  ): Promise<UserAppListResponse> {
    const query = UserAppListQuerySchema.parse({ limit, cursor: cursor ?? undefined });
    const rows = await this.ctx.db
      .prepare(
        `SELECT a.app_id, a.app_name, a.permissions_json, a.created_at, a.revoked_at
         FROM registered_apps a
         JOIN registered_users u ON u.user_id = a.owner_user_id
         WHERE a.owner_user_id = ?
           AND u.revoked_at IS NULL
           AND (? IS NULL OR a.app_id > ?)
           AND (? IS NULL OR a.app_id = ?)
         ORDER BY a.app_id
         LIMIT ?`
      )
      .bind(userId, query.cursor ?? null, query.cursor ?? null, appId ?? null, appId ?? null, query.limit + 1)
      .all<{
        app_id: string;
        app_name: string;
        permissions_json: string;
        created_at: string;
        revoked_at: string | null;
      }>();
    const items = rows.results ?? [];
    const apps = items.slice(0, query.limit).map((row) =>
      UserAppSchema.parse({
        appId: row.app_id,
        appName: row.app_name,
        permissions: JSON.parse(row.permissions_json) as string[],
        createdAt: row.created_at,
        revokedAt: row.revoked_at
      })
    );
    return { schemaVersion: 1, apps, nextCursor: items.length > query.limit ? apps.at(-1)!.appId : null };
  }

  async registerApp(input: RegisterAppRequest, ownerUserId?: string): Promise<RegisterAppResponse> {
    const parsed = RegisterAppRequestSchema.parse(input);
    const appId = crypto.randomUUID();
    const appToken = formatAppToken(generateToken());
    const tokenHash = await sha256Hex(appToken);
    const now = new Date(this.ctx.now()).toISOString();
    const permissions = ["catalog:read", "catalog:search", "demand:feedback"];

    const result = await this.ctx.db
      .prepare(
        `INSERT INTO registered_apps(app_id, app_name, token_hash, contact_email, permissions_json, created_at, revoked_at, owner_user_id)
         SELECT ?, ?, ?, ?, ?, ?, NULL, ?
         WHERE ? IS NULL OR EXISTS (SELECT 1 FROM registered_users WHERE user_id = ? AND revoked_at IS NULL)`
      )
      .bind(
        appId,
        parsed.appName,
        tokenHash,
        parsed.contactEmail || null,
        JSON.stringify(permissions),
        now,
        ownerUserId ?? null,
        ownerUserId ?? null,
        ownerUserId ?? null
      )
      .run();
    if ((result.meta as { changes?: number } | undefined)?.changes !== 1) {
      throw new CoordinatorConflict("Invalid user owner", 403);
    }

    return {
      schemaVersion: 1,
      appId,
      appName: parsed.appName,
      appToken,
      permissions
    };
  }

  async authenticateApp(appToken: string): Promise<DownstreamAppPrincipal | null> {
    if (!isAppToken(appToken)) return null;
    const tokenHash = await sha256Hex(appToken);
    const row = await this.ctx.db
      .prepare(
        `SELECT a.app_id, a.app_name, a.permissions_json, a.revoked_at, a.candidate_status,
                COALESCE(MAX(u.age_verified), 0) AS age_verified
         FROM registered_apps a
         LEFT JOIN registered_users u ON u.user_id = a.owner_user_id AND u.revoked_at IS NULL
         WHERE a.token_hash = ?
         GROUP BY a.app_id`
      )
      .bind(tokenHash)
      .first<{
        app_id: string;
        app_name: string;
        permissions_json: string;
        revoked_at: string | null;
        candidate_status: string;
        age_verified: number;
      }>();
    if (!row || row.revoked_at) return null;
    const permissions = JSON.parse(row.permissions_json) as string[];
    const candidateStatus: DownstreamAppPrincipal["candidateStatus"] =
      row.candidate_status === "review_pending" ||
      row.candidate_status === "reviewed" ||
      row.candidate_status === "trusted"
        ? row.candidate_status
        : "none";
    return {
      appId: row.app_id,
      appName: row.app_name,
      permissions,
      candidateStatus,
      isTrusted: candidateStatus === "trusted" && permissions.includes("claims:delegate"),
      isAgeVerified: Boolean(row.age_verified)
    };
  }

  async issueUserToken(
    userName: string,
    contactEmail?: string,
    ageVerified = false,
    isModerator = false
  ): Promise<{
    userId: string;
    userName: string;
    token: string;
    ageVerified: boolean;
    isModerator: boolean;
  }> {
    if (!userName.trim()) throw new Error("User name required");
    const userId = crypto.randomUUID();
    const entropy = generateToken();
    const token = formatUserToken(entropy);
    const tokenHash = await sha256Hex(token);
    const now = new Date(this.ctx.now()).toISOString();
    await this.ctx.db
      .prepare(
        `INSERT INTO registered_users(user_id, user_name, token_hash, contact_email, created_at, revoked_at, age_verified, is_moderator)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(userId, userName.trim(), tokenHash, contactEmail || null, now, ageVerified ? 1 : 0, isModerator ? 1 : 0)
      .run();
    return { userId, userName: userName.trim(), token, ageVerified, isModerator };
  }

  async authenticateUser(token: string): Promise<UserPrincipal | null> {
    if (!isUserToken(token)) return null;
    const tokenHash = await sha256Hex(token);
    const row = await this.ctx.db
      .prepare("SELECT user_id, user_name, revoked_at, age_verified, is_moderator FROM registered_users WHERE token_hash = ?")
      .bind(tokenHash)
      .first<{
        user_id: string;
        user_name: string;
        revoked_at: string | null;
        age_verified: number;
        is_moderator: number;
      }>();
    if (!row || row.revoked_at) return null;
    return {
      userId: row.user_id,
      userName: row.user_name,
      ageVerified: Boolean(row.age_verified),
      isModerator: Boolean(row.is_moderator)
    };
  }

  async recordCreatorClaimIntake(
    appId: string,
    input: CreatorClaimIntakeRequest
  ): Promise<CreatorClaimIntakeResponse> {
    const parsed = CreatorClaimIntakeRequestSchema.parse(input);
    if (parsed.attestation.appId !== appId) {
      throw new CoordinatorConflict("Attestation appId does not match caller", 403);
    }

    const nowSec = Math.floor(this.ctx.now() / 1000);
    if (parsed.attestation.expiresAt < nowSec) {
      throw new CoordinatorConflict("Attestation has expired", 400);
    }

    const recordedAt = new Date(this.ctx.now()).toISOString();
    const payloadJson = JSON.stringify(parsed);

    const existing = await this.ctx.db
      .prepare(
        `SELECT ticket_id AS claim_id, payload_json, signature, recorded_at
         FROM catalog_tickets
         WHERE ticket_type = 'delegated_claim' AND app_id = ? AND nonce = ?`
      )
      .bind(appId, parsed.attestation.nonce)
      .first<{
        claim_id: string;
        payload_json: string;
        signature: string;
        recorded_at: string;
      }>();

    if (existing) {
      if (existing.signature !== parsed.signature || existing.payload_json !== payloadJson) {
        throw new CoordinatorConflict("Nonce already used with different payload or signature", 409);
      }
      return {
        schemaVersion: 1,
        status: "accepted",
        claimId: existing.claim_id,
        reviewStatus: "pending",
        recordedAt: existing.recorded_at
      };
    }

    const claimId = crypto.randomUUID();
    const result = await this.ctx.db
      .prepare(
        `INSERT INTO catalog_tickets(
           ticket_id, ticket_type, app_id, target_url, requester_type, creator_id, challenge_token,
           expires_at, nonce, signature, proof_kind, payload_json, reason, contact_email,
           review_status, review_notes, recorded_at
         )
         SELECT ?, 'delegated_claim', app_id, ?, 'app', ?, ?, ?, ?, ?, 'delegated_signature', ?, ?, ?, 'pending', NULL, ?
         FROM registered_apps
         WHERE app_id = ? AND revoked_at IS NULL AND candidate_status = 'trusted'`
      )
      .bind(
        claimId,
        parsed.attestation.frontUrl,
        parsed.attestation.creatorId,
        parsed.attestation.challengeToken,
        parsed.attestation.expiresAt,
        parsed.attestation.nonce,
        parsed.signature,
        payloadJson,
        parsed.reason || null,
        parsed.contactEmail || null,
        recordedAt,
        appId
      )
      .run();

    if ((result.meta as { changes?: number } | undefined)?.changes !== 1) {
      throw new CoordinatorConflict("Trusted application credential with active status required", 403);
    }

    return {
      schemaVersion: 1,
      status: "accepted",
      claimId,
      reviewStatus: "pending",
      recordedAt
    };
  }

  async recordAppActivity(appId: string): Promise<void> {
    const row = await this.ctx.db
      .prepare(
        `SELECT app_id, request_count, candidate_status, candidate_flags_json
         FROM registered_apps
         WHERE app_id = ?`
      )
      .bind(appId)
      .first<{
        app_id: string;
        request_count: number;
        candidate_status: string;
        candidate_flags_json: string;
      }>();
    if (!row) return;

    const newCount = (row.request_count || 0) + 1;
    const now = new Date(this.ctx.now()).toISOString();
    let status = row.candidate_status || "none";
    let flags: string[] = [];
    try {
      flags = JSON.parse(row.candidate_flags_json || "[]") as string[];
    } catch {
      flags = [];
    }

    if (newCount >= 50) {
      if (status === "none") {
        status = "review_pending";
      }
      if (!flags.includes("intensive_usage")) {
        flags.push("intensive_usage");
      }
      if (!flags.includes("high_frequency_api")) {
        flags.push("high_frequency_api");
      }
    }

    await this.ctx.db
      .prepare(
        `UPDATE registered_apps
         SET request_count = ?, last_active_at = ?, candidate_status = ?, candidate_flags_json = ?
         WHERE app_id = ?`
      )
      .bind(newCount, now, status, JSON.stringify(flags), appId)
      .run();
  }

  async listModeratorRatingsPage(
    rating?: ContentRating,
    limit = 100,
    cursor: { updatedAt: string; canonicalId: string } | null = null
  ): Promise<{ ratings: ModeratorRatingRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Rating limit must be 1..100");
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (rating) {
      conditions.push("c.content_rating = ?");
      params.push(rating);
    }
    if (cursor) {
      conditions.push("(c.updated_at, c.canonical_id) < (?, ?)");
      params.push(cursor.updatedAt, cursor.canonicalId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const res = await this.ctx.db
      .prepare(
        `SELECT c.canonical_id, c.display_name, c.content_rating, c.umbrella, c.category, c.updated_at,
                (
                  SELECT COUNT(*) FROM catalog_tickets r
                  WHERE r.ticket_type IN ('removal_report', 'rating_dispute')
                    AND (r.canonical_id = c.canonical_id OR json_extract(r.payload_json, '$.canonicalId') = c.canonical_id)
                ) AS report_count
         FROM canonical_packages c
         ${where}
         ORDER BY c.updated_at DESC, c.canonical_id DESC
         LIMIT ?`
      )
      .bind(...params)
      .all<{
        canonical_id: string;
        display_name: string;
        content_rating: ContentRating;
        umbrella: "assets" | "tools" | "avatars";
        category: string;
        updated_at: string;
        report_count: number;
      }>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);

    const ratings: ModeratorRatingRecord[] = visible.map((row) => ({
      canonicalId: row.canonical_id,
      displayName: row.display_name,
      currentRating: row.content_rating,
      umbrella: row.umbrella,
      category: row.category,
      reportCount: row.report_count ?? 0,
      updatedAt: row.updated_at
    }));

    return {
      ratings,
      nextCursor:
        rows.length > limit && last
          ? encodeModeratorRatingCursor({ updatedAt: last.updated_at, canonicalId: last.canonical_id })
          : null
    };
  }

  async adjustPackageRating(
    canonicalId: string,
    newRating: ContentRating,
    adjustedBy: string,
    _reason: string
  ): Promise<{
    canonicalId: string;
    previousRating: ContentRating;
    newRating: ContentRating;
    adjustedBy: string;
    updatedAt: string;
  } | null> {
    const row = await this.ctx.db
      .prepare("SELECT canonical_id, content_rating, tombstone_reason FROM canonical_packages WHERE canonical_id = ?")
      .bind(canonicalId)
      .first<{
        canonical_id: string;
        content_rating: ContentRating;
        tombstone_reason: string | null;
      }>();

    if (!row) {
      return null;
    }

    const previousRating = row.content_rating;
    const updatedAt = new Date(this.ctx.now()).toISOString();
    const nextTombstoneReason =
      previousRating === "general" && newRating !== "general"
        ? "rating_withdrawn"
        : newRating === "general" && row.tombstone_reason === "rating_withdrawn"
          ? null
          : row.tombstone_reason;

    await this.ctx.db
      .prepare(
        `UPDATE canonical_packages
         SET content_rating = ?, tombstone_reason = ?, updated_at = ?
         WHERE canonical_id = ?`
      )
      .bind(newRating, nextTombstoneReason, updatedAt, canonicalId)
      .run();

    return {
      canonicalId,
      previousRating,
      newRating,
      adjustedBy,
      updatedAt
    };
  }
}
