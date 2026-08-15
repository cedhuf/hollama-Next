/**
 * Which way a list is being scrolled, said out loud only when it is sure.
 *
 * Reading the sign of one scroll event is not the same as knowing where someone
 * is going, and three separate things say "up" without anyone having asked for
 * it:
 *
 * Past the end, Safari lets the list be pulled beyond its own range and springs
 * it back, and the spring back is reported as a scroll like any other. That is
 * the one you can see on a phone: reach the bottom of the conversations, and the
 * bounce reopens the header as if you had swiped down.
 *
 * Within a flick, momentum overshoots and settles, which reverses the sign for a
 * frame or two at the end of every gesture.
 *
 * And after a flip, the header changes height, the list's own scrollable range
 * changes with it, and the browser trims the scroll position to fit. That trim
 * arrives as an upward scroll that nobody performed, and it is what turns a
 * fold into a loop: fold, trim, unfold, trim, fold.
 *
 * So: positions outside the range are not gestures and are dropped; travel is
 * accumulated while the direction holds and thrown away when it reverses, so
 * only sustained movement counts; and the moment after a flip is not read at
 * all. What is left is one arrow, from a gesture to a flag, and a single arrow
 * cannot loop.
 */
export interface ScrollDirectionOptions {
	/** How far a gesture has to travel down before it counts as one. */
	step?: number;
	/**
	 * How far it has to travel up, which is further, and deliberately so.
	 *
	 * The noise is not symmetric. A rubber band springing back from the end of the
	 * list, a flick's momentum settling, a scroll position trimmed to a shorter
	 * range: all of them push up, none of them push down. And the spring is worse
	 * the harder the list was thrown, which is why this only ever goes wrong on a
	 * fast gesture.
	 *
	 * So going up is asked to be meant. A real swipe travels hundreds of pixels
	 * and crosses this without noticing; a bounce travels tens and does not.
	 */
	stepUp?: number;
	/** How long to stop reading after a flip, in ms. Match the CSS duration. */
	settle?: number;
}

/**
 * Returns a listener to call with the scrolling element. It calls back only when
 * the answer changes: `true` on the way down, `false` on the way up, wherever in
 * the list that happens, the way a phone's own header behaves.
 */
export function watchScrollDirection(
	onChange: (scrolledAway: boolean) => void,
	{ step = 6, stepUp = 48, settle = 300 }: ScrollDirectionOptions = {}
): (element: HTMLElement) => void {
	let scrolledAway = false;
	let last = 0;
	let travel = 0;
	let deafUntil = 0;

	return (element: HTMLElement) => {
		const max = Math.max(0, element.scrollHeight - element.clientHeight);
		const top = element.scrollTop;

		// Pulled past an end, or springing back from one. Not a direction.
		if (top < 0 || top > max) return;

		const now = performance.now();
		if (now < deafUntil) {
			last = top;
			travel = 0;
			return;
		}

		const delta = top - last;
		last = top;
		if (delta === 0) return;

		travel = Math.sign(travel) === Math.sign(delta) ? travel + delta : delta;
		if (Math.abs(travel) < (travel > 0 ? step : stepUp)) return;
		travel = 0;

		// Never folded at the very top: there the header is what you are looking at.
		const next = delta > 0 && top > step;
		if (next === scrolledAway) return;

		scrolledAway = next;
		deafUntil = now + settle;
		onChange(scrolledAway);
	};
}
