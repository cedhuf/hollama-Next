import { toast } from 'svelte-sonner';
import { get } from 'svelte/store';

import LL from '$i18n/i18n-svelte';

/**
 * Put text on the clipboard, wherever the app happens to be running.
 *
 * `navigator.clipboard` does not exist outside a secure context, and a local
 * instance reached over plain HTTP on a home network is exactly that case. The
 * fallback still works there, through a throwaway textarea, and says so: the
 * copy went through a visible element, which is worth knowing on a shared
 * screen.
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
