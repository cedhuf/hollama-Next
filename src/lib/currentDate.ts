// Anchoring the model in real time.
//
// A transformer has no clock: the only way it can know "now" is to be told in the
// context. This is the standard approach across assistants (ChatGPT and Claude inject
// the date into their system prompt; Llama 3's own chat template carries a "Today Date:"
// line). The wording lives in defaultPrompts.ts (the `currentDate` prompt); here we
// only build the `{datetime}` value it interpolates.

/** The present moment in the user's local timezone: human-readable + IANA tz + local ISO date. */
export function formatCurrentDateTime(date: Date = new Date()): string {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const human = new Intl.DateTimeFormat('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}).format(date);
	const isoDate = new Intl.DateTimeFormat('en-CA').format(date); // YYYY-MM-DD, local tz
	return `${human} (${timeZone}, ${isoDate})`;
}
