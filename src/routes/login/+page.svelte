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

	const inputClass =
		'rounded-md border border-shade-3 bg-shade-0 px-3 py-2 text-sm outline-none focus:border-accent';
</script>

<div class="flex h-dvh w-screen items-center justify-center bg-shade-2 p-4">
	<div class="flex w-full max-w-sm flex-col gap-5 rounded-2xl bg-shade-1 p-6 shadow-xl">
		<div class="flex flex-col items-center gap-2 text-center">
			<Logo class="h-12 w-12" />
			<h1 class="text-lg font-semibold tracking-tight">Sign in to {APP_NAME}</h1>
		</div>

		{#if errorMessage}
			<div
				class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
			>
				{errorMessage}
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
					class="mt-1 inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-3 py-2 text-sm font-medium text-shade-0"
				>
					Sign in
				</button>
			</form>
		{/if}

		{#if data.credentials && data.oidc}
			<div class="flex items-center gap-3 text-xs text-muted">
				<span class="h-px flex-1 bg-shade-3"></span>or<span class="h-px flex-1 bg-shade-3"></span>
			</div>
		{/if}

		{#if data.oidc}
			<form method="POST" action="/auth/signin/oidc" bind:this={oidcForm}>
				<input type="hidden" name="callbackUrl" value={data.redirectTo} />
				<button
					type="submit"
					class="inline-flex w-full items-center justify-center gap-2 rounded-md border border-shade-4 px-3 py-2 text-sm font-medium hover:border-shade-6 hover:text-active"
				>
					Continue with {data.oidc.name}
				</button>
			</form>
		{/if}

		{#if !data.credentials && !data.oidc}
			<p class="text-center text-sm text-muted">No sign-in method is configured.</p>
		{/if}
	</div>
</div>
