/**
 * The instance refusing a turn, said the same way on both sides of the wire.
 *
 * A refusal has to survive the trip: it leaves as an HTTP status and a sentence,
 * and arrives at the browser as an `Error` whose message is whatever the
 * provider SDK made of the body. The status does not survive that, so the
 * sentence is the protocol — and a protocol written twice is one that drifts the
 * first time somebody rewords a message.
 *
 * Hence one module, imported by the relay that writes it and by the page that
 * reads it. The wording is English because it is a wire value, not a label: what
 * the user is shown is translated in the dialog.
 */

const MARK = 'llooma.refused';

export type RefusalReason = 'credit-limit' | 'unpriced-model';

/** What the relay answers with. The mark is what makes it recognisable later. */
export function refusal(reason: RefusalReason, detail?: string): string {
	return [MARK, reason, detail].filter(Boolean).join(': ');
}

/** What a failed turn was refused for, or nothing if it simply failed. */
export function refusalIn(message: string): { reason: RefusalReason; detail?: string } | null {
	const at = message.indexOf(MARK);
	if (at === -1) return null;

	const [, reason, ...rest] = message
		.slice(at)
		.split(':')
		.map((part) => part.trim());
	if (reason !== 'credit-limit' && reason !== 'unpriced-model') return null;

	// The detail is whatever followed, minus anything the transport wrapped it in.
	const detail = rest
		.join(': ')
		.replace(/["'}\]\s]+$/, '')
		.trim();
	return { reason, detail: detail || undefined };
}
