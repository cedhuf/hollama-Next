import { toast as sonner } from 'svelte-sonner';

import ToastBody from '$lib/components/ToastBody.svelte';

/**
 * The one way to raise a notification.
 *
 * Everything visual lives in `Toasts.svelte` and `ToastBody.svelte`, everything
 * behavioural lives here: how long each severity stays, what a notification you
 * have to click is worth, which ones wait to be dismissed. Call sites say what
 * happened and how bad it is. They cannot pass a position or a class, which is
 * how the app ended up with red banners at the top, a pull progress bar at the
 * top and update notices at the bottom right, all out of the same library.
 *
 * Import `toast` from here, never from `svelte-sonner`.
 */

export type ToastSeverity = 'success' | 'info' | 'warning' | 'error' | 'loading' | 'notice';

/** What a call site is allowed to say about its own notification. */
export type ToastOptions = {
	/** A second line under the message. Details, not a second sentence. */
	description?: string;
	/**
	 * Reuse an existing notification instead of stacking a new one. Give the same
	 * id to replace a message in place: a progress line becoming a result, a retry
	 * replacing the failure it retries.
	 */
	id?: number | string;
	/** Something to do about it. Given one, the notification waits to be read. */
	action?: { label: string; onClick: () => void };
	/**
	 * Stay until dismissed. For a state that is still true after the message goes:
	 * saving is paused, this build is out of date. Never for a plain failure.
	 */
	persist?: boolean;
	/**
	 * Offer to copy the message. Errors get it without asking, since an error is
	 * what ends up pasted into an issue. Set it where a message is worth keeping
	 * for another reason.
	 */
	copyable?: boolean;
};

/**
 * An error is read after the fact, often once the eye comes back to the screen,
 * so it stays around noticeably longer than a confirmation nobody needs to read.
 * Anything carrying a button gets longer still: a notification you have to click
 * has to survive the walk from reading it to reaching for the mouse.
 */
const DURATION = {
	success: 4_000,
	info: 5_000,
	warning: 7_000,
	error: 10_000,
	action: 12_000
} as const;

function build(
	severity: ToastSeverity,
	message: string,
	{ persist, action, copyable, description, ...rest }: ToastOptions = {},
	fallback: number
) {
	return {
		...rest,
		duration: persist ? Number.POSITIVE_INFINITY : action ? DURATION.action : fallback,
		// The close button is what makes a persistent one dismissible at all. The
		// library lays it over the corner, so the card needs the room.
		...(persist ? { closeButton: true, class: 'pr-9' } : {}),
		component: ToastBody,
		componentProps: {
			severity,
			message,
			description,
			action,
			copyable: copyable ?? severity === 'error'
		}
	};
}

export const toast = {
	success: (message: string, opts?: ToastOptions) =>
		sonner.success(message, build('success', message, opts, DURATION.success)),

	info: (message: string, opts?: ToastOptions) =>
		sonner.info(message, build('info', message, opts, DURATION.info)),

	warning: (message: string, opts?: ToastOptions) =>
		sonner.warning(message, build('warning', message, opts, DURATION.warning)),

	error: (message: string, opts?: ToastOptions) =>
		sonner.error(message, build('error', message, opts, DURATION.error)),

	/**
	 * Something is running. It has no duration of its own: pass its id to
	 * `success` or to `error` when it ends, otherwise it stays on screen forever.
	 */
	loading: (message: string, opts?: ToastOptions) =>
		sonner.loading(message, build('loading', message, { ...opts, persist: true }, DURATION.info)),

	/**
	 * News rather than an outcome: an update is out, this tab is behind. No
	 * severity colour, and it waits, because a notice that disappears on its own
	 * is one the user never had a chance to act on.
	 */
	notice: (message: string, opts: ToastOptions & { action: NonNullable<ToastOptions['action']> }) =>
		sonner(message, build('notice', message, { ...opts, persist: true }, DURATION.action)),

	/** Take one down early, or all of them when given nothing. */
	dismiss: (id?: number | string) => sonner.dismiss(id)
};
