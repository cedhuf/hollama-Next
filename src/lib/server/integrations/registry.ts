import type { IntegrationKind } from '$lib/integrations';

import { chattoProvider } from './chatto/provider';
import type { IntegrationProvider } from './types';

/** The one place that names them. Everything else in this folder is written against `IntegrationProvider`, so a second service is a new folder and one line here. */
const providers: Record<IntegrationKind, IntegrationProvider> = {
	chatto: chattoProvider
};

export function providerFor(kind: IntegrationKind): IntegrationProvider {
	return providers[kind];
}
