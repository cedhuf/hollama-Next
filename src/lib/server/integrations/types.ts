import type { IntegrationKind } from '$lib/integrations';
import type { IntegrationRecord } from '$lib/server/db/integrations';

/** Three verbs, none of which knows what a Chatto is. Adding a second service is writing one of these and putting it in the registry. */
export interface IntegrationProvider {
	kind: IntegrationKind;
	/** Returns as soon as the loop is armed, never after it has done anything: a provider that only resolved once it had work would hold the supervisor while the remote server stayed quiet. */
	start(record: IntegrationRecord, token: string): IntegrationRuntime;
	/** Takes the credential rather than reading it, so the same call answers for a stored integration and for a draft that has not been saved. */
	test(record: IntegrationRecord, token: string): Promise<TestResult>;
}

export interface IntegrationRuntime {
	/** Stop watching. Must be safe to call twice, and must not throw. */
	stop(): void;
}

export interface TestResult {
	ok: boolean;
	/** What the connection turned out to be, when it worked. Shown as-is. */
	detail?: string;
	/** Why it did not, when it did not. Shown as-is. */
	error?: string;
}
