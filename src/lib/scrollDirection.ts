/**
 * Which way a list is being scrolled, said out loud only when it is sure.
 *
 * Three things say "up" without anyone asking: Safari's rubber-banding, a
 * flick's momentum overshooting, and the browser trimming the scroll position
 * after a flip changes the header's height.
 *
 * So positions outside the range are dropped, travel is accumulated while the
 * direction holds and thrown away when it reverses, and the moment after a flip
 * is not read at all.
 */
export interface ScrollDirectionOptions {
	/** How far a gesture has to travel down before it counts as one. */
	step?: number;
	/**
	 * How far it has to travel up, which is further and deliberately so: the noise
	 * is not symmetric. A rubber band, a settling flick, a trimmed scroll position
	 * all push up and never down, and the spring is worse the harder the list was
	 * thrown. A real swipe crosses this without noticing; a bounce does not.
	 */
	stepUp?: number;
	/** How long to stop reading after a flip, in ms. Match the CSS duration. */
	settle?: number;
}

export interface ScrollDirectionWatcher {
	(element: HTMLElement): void;
	/**
	 * Forget the list being watched, for when it is not the same list any more.
	 *
	 * A new scroller starts at the top while everything held here describes the old
	 * one, so the first gesture is measured against a position it never had.
	 */
	reset(): void;
}

/** Returns a listener to call with the scrolling element. It calls back only when the answer changes, wherever in the list that happens. */
export function watchScrollDirection(
	onChange: (scrolledAway: boolean) => void,
	{ step = 6, stepUp = 48, settle = 300 }: ScrollDirectionOptions = {}
): ScrollDirectionWatcher {
	let scrolledAway = false;
	let last = 0;
	let travel = 0;
	let deafUntil = 0;

	const watch = (element: HTMLElement) => {
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

	// The answer is given back as well as cleared: this is the only holder of it,
	// and a caller left believing the old one is the state this exists to prevent.
	watch.reset = () => {
		last = 0;
		travel = 0;
		deafUntil = 0;
		if (!scrolledAway) return;
		scrolledAway = false;
		onChange(false);
	};

	return watch;
}
