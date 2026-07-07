<script lang="ts">
	import { ArrowLeft, ArrowRight, Check, Upload, X } from '@lucide/svelte';
	import { Dialog } from 'bits-ui';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import { applyBackupToStores } from '$lib/data/applyBackup';
	import { settingsStore } from '$lib/localStorage';
	import { onboardingOpen } from '$lib/stores/modal';

	import Profile from './settings/Profile.svelte';
	import Servers from './settings/Servers.svelte';

	let step = $state(0);
	let fileInput: HTMLInputElement | undefined = $state();

	const TOTAL_STEPS = 4;

	function finish() {
		$settingsStore.onboardingComplete = true;
		$onboardingOpen = false;
		step = 0;
	}

	function restoreFromBackup(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const backup = JSON.parse(e.target?.result as string);
				applyBackupToStores(backup);
				toast.success($LL.importSuccess());
				step = TOTAL_STEPS - 1; // jump to the final screen
			} catch (error) {
				console.error(error);
				toast.error($LL.importError(), {
					description: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		};
		reader.readAsText(input.files[0]);
	}
</script>

<Dialog.Root
	open={$onboardingOpen}
	onOpenChange={(o) => {
		if (!o) finish();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed inset-0 z-50 m-auto flex h-fit max-h-[88vh] w-[92vw] max-w-lg flex-col overflow-hidden rounded-2xl bg-shade-1 shadow-xl"
		>
			<!-- Step indicator -->
			<div class="flex items-center gap-3 px-5 pb-3 pt-5">
				<div class="flex flex-1 gap-1.5">
					{#each Array.from({ length: TOTAL_STEPS }, (_, i) => i) as i (i)}
						<span
							class="h-1 flex-1 rounded-full transition-colors {i <= step
								? 'bg-accent'
								: 'bg-shade-3'}"
						></span>
					{/each}
				</div>
				<Dialog.Close
					class="rounded-md p-1 text-muted transition-colors hover:bg-shade-2 hover:text-active"
					aria-label="Close"
				>
					<X class="h-4 w-4" />
				</Dialog.Close>
			</div>

			<!-- Step content -->
			<div class="flex-1 overflow-auto px-5 py-4">
				{#if step === 0}
					<div class="flex flex-col items-center gap-4 py-4 text-center">
						<img class="logo-ink h-14 w-14" src="/logo-mark.png" alt="Hollama Next" />
						<div class="flex flex-col gap-1">
							<h2 class="text-lg font-semibold tracking-tight">Welcome to Hollama Next</h2>
							<p class="text-sm text-muted">Let's set things up — it only takes a minute.</p>
						</div>
						<div class="flex w-full flex-col gap-2 pt-2">
							<Button onclick={() => (step = 1)}>
								Get started
								<ArrowRight class="base-icon" />
							</Button>
							<button
								type="button"
								onclick={() => fileInput?.click()}
								class="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-shade-2 hover:text-active"
							>
								<Upload class="h-4 w-4" />
								I have a backup to restore
							</button>
							<input
								bind:this={fileInput}
								type="file"
								accept="application/json"
								class="hidden"
								onchange={restoreFromBackup}
							/>
						</div>
					</div>
				{:else if step === 1}
					<Profile />
				{:else if step === 2}
					<Servers />
				{:else if step === 3}
					<div class="flex flex-col items-center gap-4 py-6 text-center">
						<div class="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
							<Check class="h-7 w-7 text-white" />
						</div>
						<div class="flex flex-col gap-1">
							<h2 class="text-lg font-semibold tracking-tight">You're all set</h2>
							<p class="text-sm text-muted">You can change any of this later in Settings.</p>
						</div>
						<Button onclick={finish}>Enter Hollama</Button>
					</div>
				{/if}
			</div>

			<!-- Footer navigation -->
			{#if step > 0 && step < 3}
				<div class="flex items-center justify-between gap-2 border-t border-shade-2 p-4">
					<Button variant="outline" onclick={() => (step -= 1)}>
						<ArrowLeft class="base-icon" />
					</Button>
					<div class="flex items-center gap-3">
						{#if step === 2}
							<button
								type="button"
								onclick={() => (step = 3)}
								class="text-sm text-muted transition-colors hover:text-active"
							>
								Skip for now
							</button>
						{/if}
						<Button onclick={() => (step += 1)}>
							Continue
							<ArrowRight class="base-icon" />
						</Button>
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
