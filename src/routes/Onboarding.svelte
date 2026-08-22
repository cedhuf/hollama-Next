<script lang="ts">
	import { ArrowLeft, ArrowRight, Check, Upload } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import LL from '$i18n/i18n-svelte';
	import { APP_NAME } from '$lib/brand';
	import Button from '$lib/components/Button.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import OnboardingDialog from '$lib/components/OnboardingDialog.svelte';
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

<!-- Steps 0 and 3 carry their own call to action, so they get no footer at all. -->
{#snippet navFooter()}
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
{/snippet}

<OnboardingDialog
	open={$onboardingOpen}
	{step}
	totalSteps={TOTAL_STEPS}
	onDismiss={finish}
	footer={step > 0 && step < 3 ? navFooter : undefined}
>
	{#if step === 0}
		<div class="flex flex-col items-center gap-4 py-4 text-center">
			<Logo class="h-14 w-14" />
			<div class="flex flex-col gap-1">
				<h2 class="text-lg font-semibold tracking-tight">
					{$LL.onboardingWelcome({ app: APP_NAME })}
				</h2>
				<p class="text-sm text-muted">{$LL.onboardingWelcomeBody()}</p>
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
				<h2 class="text-lg font-semibold tracking-tight">{$LL.onboardingDone()}</h2>
				<p class="text-sm text-muted">{$LL.onboardingDoneBody()}</p>
			</div>
			<Button onclick={finish}>{$LL.onboardingEnter({ app: APP_NAME })}</Button>
		</div>
	{/if}
</OnboardingDialog>
