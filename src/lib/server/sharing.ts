/**
 * How an admin's setting reaches everybody else. Three answers, the same three
 * everywhere:
 *
 *   off          nothing is shared; everyone keeps their own.
 *   locked       the admin's value, read-only. Not a default: a decision.
 *   overridable  the admin's value as a starting point, which anyone may
 *                replace. "Restore" clears their copy and hands it back.
 *
 * Admins always resolve to their own: the snapshot they share IS their own.
 */
export type Sharing = 'off' | 'locked' | 'overridable';

export interface Shared<T> {
	/** The value to use, and to show. */
	value: T;
	/** Whether this person may change it. */
	editable: boolean;
	/** Whose value `value` is. `none` never occurs here; kept for callers that report it. */
	source: 'admin' | 'user' | 'none';
	/** Whether an admin is sharing at all, i.e. whether to say so in the UI. */
	shared: boolean;
	/** The admin's snapshot, for the overridable default and for "restore". */
	adminValue: T;
}

export function resolveShared<T>(input: {
	/** This person's own value. */
	own: T;
	/** The admin's shared snapshot, read lazily: `off` must not touch it. */
	admin: () => T;
	/** What "nothing shared" looks like, so callers never invent their own blank. */
	empty: T;
	sharing: Sharing;
	isAdmin: boolean;
	/** Whether a value counts as set. An empty string is not an override. */
	hasContent: (value: T) => boolean;
	/**
	 * How the admin's value and this person's combine under `overridable`. Absent,
	 * the person's replaces the admin's outright, which is right for one search
	 * engine or one theme. A map of independent entries needs the other answer:
	 * rewriting one of twenty prompts must not discard the other nineteen.
	 */
	merge?: (admin: T, own: T) => T;
}): Shared<T> {
	const { own, empty, sharing, isAdmin, hasContent } = input;

	if (isAdmin || sharing === 'off') {
		return { value: own, editable: true, source: 'user', shared: false, adminValue: empty };
	}

	const admin = input.admin();

	if (sharing === 'locked') {
		return { value: admin, editable: false, source: 'admin', shared: true, adminValue: admin };
	}

	if (!hasContent(own)) {
		return { value: admin, editable: true, source: 'admin', shared: true, adminValue: admin };
	}
	const value = input.merge ? input.merge(admin, own) : own;
	return { value, editable: true, source: 'user', shared: true, adminValue: admin };
}
