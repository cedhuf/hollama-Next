// Anchoring the model in real time.
//
// A transformer has no clock: the only way it can know "now" is to be told in the
// context. This is the standard approach across assistants (ChatGPT and Claude inject
// the date into their system prompt; Llama 3's own chat template carries a "Today Date:"
// line). Without it, the model falls back to its training-cutoff sense of time and may
// reject facts that postdate it as "fakes".

/**
 * A system message stating the present moment (in the user's local timezone),
 * prepended to each request so the model defers to it over its training prior.
 */
export function currentDateSystemMessage(date: Date = new Date()): string {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	// Human-readable (weekday + month name) plus an unambiguous local ISO date.
	const human = new Intl.DateTimeFormat('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}).format(date);
	const isoDate = new Intl.DateTimeFormat('en-CA').format(date); // YYYY-MM-DD, local tz

	return (
		`The current date and time is ${human} (${timeZone}, ${isoDate}). ` +
		'Treat this as the authoritative present moment — it overrides any date you might infer from your training data. ' +
		'If something seems impossible only because it postdates your training, do not dismiss it as fake or a rumour; ' +
		'defer to this date and to any real-time or web-search information you are given.'
	);
}
