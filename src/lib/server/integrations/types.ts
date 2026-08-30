import type { IntegrationKind } from '$lib/integrations';
import type { IntegrationRecord } from '$lib/server/db/integrations';

/**
 * What every integration has to be, from the supervisor's point of view.
 *
 * Three verbs, and none of them knows what a Chatto is. Adding a second service
 * is writing one of these and putting it in the registry; nothing above this
 * file changes, and nothing below it leaks upward.
 */
export interface IntegrationProvider {
	kind: IntegrationKind;
	/**
	 * Begin watching. Returns as soon as the loop is armed, never after it has
	 * done anything: a provider that only resolved once it had work would hold
	 * the supervisor for as long as the remote server stayed quiet.
	 */
	start(record: IntegrationRecord, token: string): IntegrationRuntime;
	/**
	 * Does this configuration reach anything, and as whom. For the form's button.
	 *
	 * Takes the credential rather than reading it, so the same call answers for a
	 * stored integration and for a draft that has not been saved yet.
	 */
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
