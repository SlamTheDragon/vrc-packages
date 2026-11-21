import {
	VRCPAdminClient,
	VRCPApiError,
	isOperatorToken,
	isUserToken,
	type PipelineChannelInfo
} from '$lib/api/admin-client';
import type { EvidenceState } from '$lib/components/ui/types';

export type AdminRole = 'operator' | 'moderator';

export const COORDINATOR_PRESETS = [
	{
		value: 'https://vrc-package-crawler-preview.slamthedragon.workers.dev',
		label: 'Preview Worker (Cloudflare Edge)',
		description: 'https://vrc-package-crawler-preview.slamthedragon.workers.dev'
	},
	{
		value: 'http://127.0.0.1:8787',
		label: 'Local Dev Worker (Wrangler D1)',
		description: 'http://127.0.0.1:8787'
	}
] as const;

const SESSION_STORAGE_KEY = 'vrcp_web_admin_session_v1';

interface StoredSession {
	coordinatorUrl: string;
	role: AdminRole;
	token: string;
	authenticated: boolean;
	verifiedAt: string | null;
}

function isBrowser(): boolean {
	return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function isValidCoordinatorUrl(rawUrl: string): boolean {
	try {
		const url = new URL(rawUrl.trim());
		if (url.protocol === 'https:') return true;
		if (
			url.protocol === 'http:' &&
			(url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]')
		) {
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

export function validateRoleToken(role: AdminRole, rawToken: string): { valid: boolean; reason?: string } {
	const trimmed = rawToken.trim();
	if (!trimmed) {
		return { valid: false, reason: 'Enter a runtime bearer token.' };
	}
	if (role === 'operator') {
		if (!isOperatorToken(trimmed)) {
			return {
				valid: false,
				reason: 'Operator token must be a 64-character hexadecimal string.'
			};
		}
		return { valid: true };
	}
	if (!isUserToken(trimmed)) {
		return {
			valid: false,
			reason: 'Moderator token must use the vrcp_usr_<64-hex> format.'
		};
	}
	return { valid: true };
}

class AdminSessionStore {
	coordinatorUrl = $state<string>(COORDINATOR_PRESETS[0].value);
	role = $state<AdminRole>('operator');
	token = $state<string>('');
	authenticated = $state<boolean>(false);
	verifiedAt = $state<string | null>(null);
	isProbing = $state<boolean>(false);
	lastProbeMessage = $state<string | null>(null);
	lastProbeState = $state<EvidenceState>('unverified');
	lastError = $state<string | null>(null);

	client = $derived.by(() => {
		const baseUrl = isValidCoordinatorUrl(this.coordinatorUrl)
			? this.coordinatorUrl.trim()
			: COORDINATOR_PRESETS[0].value;
		const trimmedToken = this.token.trim();
		return new VRCPAdminClient({
			baseUrl,
			operatorToken: this.role === 'operator' && trimmedToken ? trimmedToken : undefined,
			userToken: this.role === 'moderator' && trimmedToken ? trimmedToken : undefined
		});
	});

	pipelineInfo = $derived.by<PipelineChannelInfo>(() => this.client.getPipelineChannelInfo());

	coordinatorHostname = $derived.by(() => {
		try {
			return new URL(this.coordinatorUrl).host;
		} catch {
			return 'invalid-host';
		}
	});

	tokenValidation = $derived.by(() => validateRoleToken(this.role, this.token));

	evidenceState = $derived.by<EvidenceState>(() => {
		if (this.lastError) return 'failed';
		if (this.authenticated) return 'measured';
		if (this.lastProbeState === 'qualified') return 'qualified';
		return 'unverified';
	});

	constructor() {
		this.hydrateFromSessionStorage();
	}

	hydrateFromSessionStorage(): void {
		if (!isBrowser()) return;
		try {
			const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as Partial<StoredSession>;
			if (typeof parsed.coordinatorUrl === 'string' && isValidCoordinatorUrl(parsed.coordinatorUrl)) {
				this.coordinatorUrl = parsed.coordinatorUrl;
			}
			if (parsed.role === 'operator' || parsed.role === 'moderator') {
				this.role = parsed.role;
			}
			if (typeof parsed.token === 'string') {
				const check = validateRoleToken(this.role, parsed.token);
				if (check.valid) {
					this.token = parsed.token.trim();
					this.authenticated = Boolean(parsed.authenticated);
					this.verifiedAt = typeof parsed.verifiedAt === 'string' ? parsed.verifiedAt : null;
				}
			}
		} catch {
			// ignore malformed session storage
		}
	}

	private persistToSessionStorage(): void {
		if (!isBrowser()) return;
		try {
			const payload: StoredSession = {
				coordinatorUrl: this.coordinatorUrl.trim(),
				role: this.role,
				token: this.token.trim(),
				authenticated: this.authenticated,
				verifiedAt: this.verifiedAt
			};
			window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
		} catch {
			// ignore storage quota errors
		}
	}

	setCoordinatorUrl(url: string): void {
		this.coordinatorUrl = url;
		this.authenticated = false;
		this.verifiedAt = null;
		this.lastError = null;
		this.persistToSessionStorage();
	}

	setRole(nextRole: AdminRole): void {
		if (this.role !== nextRole) {
			this.role = nextRole;
			this.token = '';
			this.authenticated = false;
			this.verifiedAt = null;
			this.lastError = null;
			this.persistToSessionStorage();
		}
	}

	setToken(rawToken: string): void {
		this.token = rawToken;
		this.authenticated = false;
		this.verifiedAt = null;
		this.lastError = null;
	}

	async probePublicCatalog(): Promise<boolean> {
		this.lastError = null;
		if (!isValidCoordinatorUrl(this.coordinatorUrl)) {
			this.lastError = 'Coordinator URL must use HTTPS or local loopback (127.0.0.1 / localhost).';
			this.lastProbeState = 'failed';
			return false;
		}
		this.isProbing = true;
		try {
			const res = await this.client.index.query({ limit: 1 });
			this.lastProbeState = 'qualified';
			this.lastProbeMessage = `Public index reachable (${res.packages.length} sample row, schema v${res.schemaVersion}).`;
			return true;
		} catch (err) {
			this.lastProbeState = 'failed';
			this.lastError = formatAdminError(err);
			return false;
		} finally {
			this.isProbing = false;
		}
	}

	async authenticateSession(): Promise<boolean> {
		this.lastError = null;
		if (!isValidCoordinatorUrl(this.coordinatorUrl)) {
			this.lastError = 'Coordinator URL must use HTTPS or local loopback (127.0.0.1 / localhost).';
			this.lastProbeState = 'failed';
			return false;
		}
		const check = validateRoleToken(this.role, this.token);
		if (!check.valid) {
			this.lastError = check.reason ?? 'Invalid token format.';
			this.lastProbeState = 'failed';
			return false;
		}

		this.isProbing = true;
		try {
			if (this.role === 'operator') {
				const res = await this.client.operator.catalog.list({ limit: 1 });
				this.authenticated = true;
				this.verifiedAt = new Date().toISOString();
				this.lastProbeState = 'measured';
				this.lastProbeMessage = `Operator session verified via GET /v1/operator/catalog (${res.packages.length} row sample).`;
			} else {
				const res = await this.client.moderator.ratings.list({ limit: 1 });
				this.authenticated = true;
				this.verifiedAt = new Date().toISOString();
				this.lastProbeState = 'measured';
				this.lastProbeMessage = `Moderator session verified via GET /v1/moderator/ratings (${res.ratings.length} row sample).`;
			}
			this.persistToSessionStorage();
			return true;
		} catch (err) {
			this.authenticated = false;
			this.verifiedAt = null;
			this.lastProbeState = 'failed';
			this.lastError = formatAdminError(err);
			return false;
		} finally {
			this.isProbing = false;
		}
	}

	signOut(): void {
		this.token = '';
		this.authenticated = false;
		this.verifiedAt = null;
		this.lastError = null;
		this.lastProbeMessage = 'Session cleared from runtime memory and sessionStorage.';
		this.lastProbeState = 'unverified';
		if (isBrowser()) {
			try {
				window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
			} catch {
				// ignore
			}
		}
	}
}

export function formatAdminError(err: unknown): string {
	if (err instanceof VRCPApiError) {
		const codeSuffix = err.code ? ` [${err.code}]` : '';
		return `HTTP ${err.status}${codeSuffix}: ${err.message}`;
	}
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}

export const adminSession = new AdminSessionStore();
