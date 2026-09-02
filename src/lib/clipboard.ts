import { get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';
import { toast } from '$lib/toast';

/**
 * `navigator.clipboard` does not exist outside a secure context, which is what a
 * local instance reached over plain HTTP is. The fallback goes through a
 * throwaway textarea, and says so: the copy passed through a visible element.
 */
export async function copyText(content: string): Promise<void> {
	const $LL = get(LL);

	if (navigator.clipboard && window.isSecureContext) {
		await navigator.clipboard.writeText(content);
		return;
	}

	const textArea = document.createElement('textarea');
	textArea.value = content;
	document.body.appendChild(textArea);
	textArea.select();
	try {
		document.execCommand('copy');
		toast.warning($LL.copiedNotPrivate());
	} catch (error) {
		console.error(error);
		toast.error($LL.notCopiedNotPrivate());
	}
	document.body.removeChild(textArea);
}
