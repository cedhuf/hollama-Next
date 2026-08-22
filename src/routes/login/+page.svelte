<script lang="ts">
	import { onMount } from 'svelte';

	import { APP_NAME } from '$lib/brand';
	import Logo from '$lib/components/Logo.svelte';

	let { data } = $props();

	let oidcForm: HTMLFormElement | undefined = $state();

	onMount(() => {
		if (data.autoRedirect) oidcForm?.requestSubmit();
	});

	const errorMessage = $derived(
		data.error === 'CredentialsSignin'
			? 'Invalid email or password.'
			: data.error
				? 'Sign-in failed. Please try again.'
				: null
	);

	/**
	 * The code Auth.js sent back, shown under the message.
	 *
	 * "Sign-in failed" is what somebody can act on; the code is what whoever runs
	 * the instance can act on, and it was being dropped. `Configuration` means the
	 * provider could not be built or its discovery document could not be fetched
	 * *from the server* — which looks identical, from a browser that can reach the
	 * identity provider perfectly well. Hiding that turns a one-line diagnosis
	 * into an evening.
	 */
	const errorCode = $derived(data.error && data.error !== 'CredentialsSignin' ? data.error : null);

	const inputClass =
		'rounded-md border border-shade-3 bg-shade-0 px-3 py-2 text-sm outline-none focus:border-accent';
</script>

<div class="bg-shade-2 flex h-dvh w-screen items-center justify-center p-4">
	<div class="bg-shade-1 flex w-full max-w-sm flex-col gap-5 rounded-2xl p-6 shadow-xl">
		<div class="flex flex-col items-center gap-2 text-center">
			<Logo class="h-12 w-12" />
			<h1 class="text-lg font-semibold tracking-tight">Sign in to {APP_NAME}</h1>
		</div>

		{#if errorMessage}
			<div
				class="border-negative/40 bg-negative/10 text-negative rounded-md border px-3 py-2 text-sm"
			>
				{errorMessage}
				{#if errorCode}
					<span class="mt-1 block font-mono text-xs opacity-70">{errorCode}</span>
				{/if}
			</div>
		{/if}

		{#if data.credentials}
			<form method="POST" action="/auth/callback/credentials" class="flex flex-col gap-3">
				<input type="hidden" name="callbackUrl" value={data.redirectTo} />
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-muted">Email</span>
					<input name="email" type="email" autocomplete="email" required class={inputClass} />
				</label>
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-muted">Password</span>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						required
						class={inputClass}
					/>
				</label>
				<button
					type="submit"
					class="border-accent bg-accent text-shade-0 mt-1 inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
				>
					Sign in
				</button>
			</form>
		{/if}

		{#if data.credentials && data.oidc}
			<div class="text-muted flex items-center gap-3 text-xs">
				<span class="bg-shade-3 h-px flex-1"></span>or<span class="bg-shade-3 h-px flex-1"></span>
			</div>
		{/if}

		{#if data.oidc}
			<form method="POST" action="/auth/signin/oidc" bind:this={oidcForm}>
				<input type="hidden" name="callbackUrl" value={data.redirectTo} />
				<button
					type="submit"
					class="border-shade-4 hover:border-shade-6 hover:text-active inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
				>
					Continue with {data.oidc.name}
				</button>
			</form>
		{/if}

		{#if !data.credentials && !data.oidc}
			<p class="text-muted text-center text-sm">No sign-in method is configured.</p>
		{/if}
	</div>
</div>
