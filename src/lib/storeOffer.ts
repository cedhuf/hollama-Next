/**
 * What a store card offers, whatever the store is selling.
 *
 * A card is about one of exactly two things:
 *
 * - a **package**, which the store publishes. You install it. It says
 *   `installed` only while you hold an untouched copy, the one case where
 *   installing again would hand you what you already have.
 * - a **copy**, which is in your library. There is nothing to install; what it
 *   offers is to go back to what was published.
 *
 * Every view is a selection of those two, never a third behaviour. That is what
 * stopped the persona store telling people to install what they had written.
 */

import type { StoreKind } from './store';

export type OfferKind = 'package' | 'copy';

/** What the one button on a card does. Computed once, when the card is built. */
export type OfferAction = 'install' | 'installed' | 'restore' | 'update';

/** Two for everyone, what you can install and what is yours, and a third for an administrator, who has a list of what they hand out. */
export type OfferView = 'store' | 'mine' | 'shared';

/** How an installed copy stands against what the store publishes. */
export type InstalledState = 'own' | 'clean' | 'edited' | 'outdated' | 'edited-outdated';

export interface Offer {
	key: string;
	kind: OfferKind;
	/** Not the same question as `kind`, which says whether the card is on offer or yours. This says what the thing *is*, and it is what lets one storefront hold several catalogues. */
	family: StoreKind;
	name: string;
	/** The one line under the name: a tagline, a summary, whatever the kind calls it. */
	line: string;
	tags: string[];
	action: OfferAction;
	/** Absent for `installed`, which is a statement rather than a control. */
	run?: () => Promise<void>;
	/** Only a copy you have changed carries a label, and it is the only label. */
	edited: boolean;
	shared: boolean;
	toggleShare: () => Promise<void>;
	/** A quiet line under the rest: how long a procedure is, who wrote it, whatever the kind has to add. The shell passes it on and never reads it. */
	meta?: string;
}

/** A copy that says something other than what was published. */
export const isEdited = (state: InstalledState): boolean =>
	state === 'edited' || state === 'edited-outdated';

/** `installed` only while an untouched copy is held: with one you have edited, installing again is how to get the published one back alongside yours. */
export const packageAction = (hasUntouchedCopy: boolean): OfferAction =>
	hasUntouchedCopy ? 'installed' : 'install';

/** Yours: nothing to install, so the button either states that or offers to put the published version back. */
export const copyAction = (state: InstalledState): OfferAction =>
	isEdited(state) ? 'restore' : state === 'outdated' ? 'update' : 'installed';

/** The search everything is filtered through, so two stores cannot disagree about it. */
export function matches(offer: Offer, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return (
		offer.name.toLowerCase().includes(q) ||
		offer.line.toLowerCase().includes(q) ||
		offer.tags.some((tag) => tag.toLowerCase().includes(q))
	);
}
