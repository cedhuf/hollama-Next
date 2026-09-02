<script lang="ts">
	import {
		Archive,
		ArchiveRestore,
		Download,
		FolderUp,
		Trash2,
		TriangleAlert
	} from '@lucide/svelte';

	import LL from '$i18n/i18n-svelte';
	import { APP_SLUG } from '$lib/brand';
	import Button from '$lib/components/Button.svelte';
	import { confirmAction } from '$lib/components/ConfirmDialog.svelte';
	import type { Server } from '$lib/connections';
	import { repository } from '$lib/data';
	import { applyBackupToStores, applyToStore } from '$lib/data/applyBackup';
	import type { Knowledge } from '$lib/knowledge';
	import {
		knowledgeStore,
		personaMemoryStore,
		personasStore,
		playbooksStore,
		serversStore,
		sessionsStore,
		settingsStore,
		StorageKey
	} from '$lib/localStorage';
	import type { PersonaMemory } from '$lib/personaMemory';
	import type { Persona } from '$lib/personas';
	import type { Playbook } from '$lib/playbooks';
	import type { Session } from '$lib/sessions';
	import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';
	import { toast } from '$lib/toast';

	import SettingsPanel from './SettingsPanel.svelte';
	import SettingsSection from './SettingsSection.svelte';

	/** The collections take `replaceAll` rather than `set`: wiping a category here is a deliberate instruction, unlike the accidental wholesale writes their per-item persistence now rules out. */
	const replaceStore: Record<StorageKey, (value: unknown) => void> = {
		[StorageKey.Preferences]: (value) => settingsStore.set(value as Settings),
		[StorageKey.Servers]: (value) => serversStore.set(value as Server[]),
		[StorageKey.Sessions]: (value) => sessionsStore.replaceAll(value as Session[]),
		[StorageKey.Knowledge]: (value) => knowledgeStore.replaceAll(value as Knowledge[]),
		[StorageKey.Personas]: (value) => personasStore.replaceAll(value as Persona[]),
		[StorageKey.Playbooks]: (value) => playbooksStore.replaceAll(value as Playbook[]),
		[StorageKey.PersonaMemory]: (value) => personaMemoryStore.replaceAll(value as PersonaMemory[])
	};

	function download(data: string, fileName: string) {
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	interface DataSource {
		storageKey: StorageKey;
		fileName: string;
		label: string;
		description: string;
	}

	// Reactive, since the labels come from $LL: one source of truth for the rows.
	const dataSources = $derived<DataSource[]>([
		{
			storageKey: StorageKey.Servers,
			fileName: `${APP_SLUG}-servers.json`,
			label: $LL.servers(),
			description: $LL.serversDescription()
		},
		{
			storageKey: StorageKey.Preferences,
			fileName: `${APP_SLUG}-preferences.json`,
			label: $LL.preferences(),
			description: $LL.preferencesDescription()
		},
		{
			storageKey: StorageKey.Sessions,
			fileName: `${APP_SLUG}-sessions.json`,
			label: $LL.sessions(),
			description: $LL.sessionsDescription()
		},
		{
			storageKey: StorageKey.Knowledge,
			fileName: `${APP_SLUG}-knowledge.json`,
			label: $LL.knowledge(),
			description: $LL.knowledgeDescription()
		},
		{
			storageKey: StorageKey.Personas,
			fileName: `${APP_SLUG}-personas.json`,
			label: $LL.personas(),
			description: $LL.personasDescription()
		},
		{
			storageKey: StorageKey.Playbooks,
			fileName: `${APP_SLUG}-playbooks.json`,
			label: $LL.playbooks(),
			description: $LL.playbooksDescription()
		},
		// Its own row rather than part of the personas one, because it is the most
		// personal thing the app holds and deleting it must not mean deleting the
		// personas that wrote it.
		{
			storageKey: StorageKey.PersonaMemory,
			fileName: `${APP_SLUG}-persona-memory.json`,
			label: $LL.personaMemory(),
			description: $LL.personaMemoryDescription()
		}
	]);

	// The value a category resets to when deleted.
	const defaults: Record<StorageKey, unknown> = {
		[StorageKey.Preferences]: DEFAULT_SETTINGS,
		[StorageKey.Servers]: [],
		[StorageKey.Sessions]: [],
		[StorageKey.Knowledge]: [],
		[StorageKey.Personas]: [],
		[StorageKey.Playbooks]: [],
		[StorageKey.PersonaMemory]: []
	};

	/** Exported from storage, not from the store: the conversation store holds summaries, so reading it here wrote a backup that looked complete and restored empty conversations. */
	async function exportData(storageKey: StorageKey, fileName: string) {
		const backup = await repository.exportBackup();
		download(JSON.stringify(backup[storageKey] ?? defaults[storageKey]), fileName);
	}

	async function importData(event: Event, storageKey: StorageKey) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0];

		const go = await confirmAction({
			title: $LL.areYouSureYouWantToImportData(),
			action: $LL.import(),
			destructive: true
		});
		if (!go) {
			input.value = ''; // Reset the file input
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				applyToStore(storageKey, JSON.parse(e.target?.result as string));
				toast.success($LL.importSuccess());
			} catch (error) {
				console.error(error);
				toast.error($LL.importError(), {
					description: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		};
		reader.readAsText(file);
	}

	async function exportBackup() {
		const backup = await repository.exportBackup();
		download(
			JSON.stringify(backup, null, 2),
			`${APP_SLUG}-backup-${new Date().toISOString().slice(0, 10)}.json`
		);
	}

	async function importBackup(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0];

		const go = await confirmAction({
			title: $LL.areYouSureYouWantToImportData(),
			action: $LL.import(),
			destructive: true
		});
		if (!go) {
			input.value = '';
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				applyBackupToStores(JSON.parse(e.target?.result as string));
				toast.success($LL.importSuccess());
			} catch (error) {
				console.error(error);
				toast.error($LL.importError(), {
					description: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		};
		reader.readAsText(file);
	}

	async function deleteData(storageKey: StorageKey) {
		const confirmMessages: Record<StorageKey, string> = {
			[StorageKey.Preferences]: $LL.areYouSureYouWantToDeleteAllPreferences(),
			[StorageKey.Servers]: $LL.areYouSureYouWantToDeleteAllServers(),
			[StorageKey.Sessions]: $LL.areYouSureYouWantToDeleteAllSessions(),
			[StorageKey.Knowledge]: $LL.areYouSureYouWantToDeleteAllKnowledge(),
			[StorageKey.Personas]: $LL.areYouSureYouWantToDeleteAllPersonas(),
			[StorageKey.Playbooks]: $LL.areYouSureYouWantToDeleteAllPlaybooks(),
			[StorageKey.PersonaMemory]: $LL.areYouSureYouWantToDeleteAllPersonaMemory()
		};

		const go = await confirmAction({
			title: confirmMessages[storageKey],
			action: $LL.delete(),
			destructive: true
		});
		if (!go) return;
		replaceStore[storageKey](defaults[storageKey]);
		toast.info($LL.deleteSuccess());
	}

	let confirmReset = $state(false);

	// Wipes every source and reloads into a fresh app, which re-triggers onboarding.
	async function resetEverything() {
		if (!confirmReset) {
			confirmReset = true;
			return;
		}
		await repository.resetAll();
		window.location.href = '/';
	}
</script>

<SettingsPanel>
	<input
		id="import-backup-input"
		type="file"
		accept="application/json"
		style="display: none;"
		onchange={importBackup}
	/>
	<SettingsSection
		title={$LL.backupAndRestore()}
		description={$LL.backupAndRestoreDescription()}
		card
	>
		<!-- Two equal halves: neither action is the primary one. -->
		<nav class="grid grid-cols-2 gap-2" data-testid="data-management-backup">
			<Button variant="outline" class="w-full justify-center" onclick={exportBackup}>
				<Archive class="base-icon" />
				{$LL.backup()}
			</Button>
			<Button
				variant="outline"
				class="w-full justify-center"
				onclick={() => document.getElementById('import-backup-input')?.click()}
			>
				<ArchiveRestore class="base-icon" />
				{$LL.restore()}
			</Button>
		</nav>
	</SettingsSection>

	<SettingsSection title={$LL.byCategory()} description={$LL.byCategoryDescription()}>
		{#each dataSources as dataSource (dataSource.storageKey)}
			<div
				class="flex flex-grow flex-col gap-2 sm:flex-row"
				data-testid={`data-management-${dataSource.storageKey}`}
			>
				<input
					id={`import-${dataSource.storageKey}-input`}
					type="file"
					accept="application/json"
					style="display: none;"
					onchange={(e) => importData(e, dataSource.storageKey)}
				/>
				<div
					class="border-shade-3 bg-shade-0 inline-flex w-full flex-grow flex-col justify-between gap-x-2 rounded-xl border p-3 text-sm leading-tight text-balance sm:flex-row sm:items-center"
				>
					<div class="flex flex-col">
						<span class="text-active text-sm font-medium">{dataSource.label}</span>
						<span class="text-muted text-xs">{dataSource.description}</span>
					</div>

					<nav class="mt-4 flex justify-between sm:mt-0">
						<Button
							variant="icon"
							onclick={() => exportData(dataSource.storageKey, dataSource.fileName)}
						>
							<Download class="base-icon" />
							{$LL.export()}
						</Button>
						<Button
							variant="icon"
							onclick={() =>
								document
									.getElementById(`import-${dataSource.storageKey.toLowerCase()}-input`)
									?.click()}
						>
							<FolderUp class="base-icon" />
							{$LL.import()}
						</Button>
						<Button variant="icon" onclick={() => deleteData(dataSource.storageKey)}>
							<Trash2 class="base-icon" />
							{$LL.delete()}
						</Button>
					</nav>
				</div>
			</div>
		{/each}
	</SettingsSection>

	<!-- Danger zone: a card like the others, outlined in the negative colour so it
	     is never skimmed past as just another section. -->
	<section
		class="border-negative/40 bg-shade-0 flex flex-col gap-2.5 rounded-xl border p-4"
		data-testid="data-management-reset"
	>
		<div class="flex flex-col gap-0.5">
			<h3 class="text-negative text-sm font-medium">{$LL.dangerZone()}</h3>
			<p class="text-muted text-xs leading-snug">{$LL.resetEverythingDescription()}</p>
		</div>

		{#if confirmReset}
			<div class="border-negative/30 bg-shade-1 flex flex-col gap-2 rounded-md border p-3">
				<span class="text-negative text-sm font-medium">{$LL.confirmResetEverything()}</span>
				<div class="flex gap-2">
					<!-- Tailwind 4 puts the important modifier at the end; the old `!bg-…` form
					     silently compiled to nothing, so this button was never red. -->
					<Button variant="default" class="bg-negative! border-negative!" onclick={resetEverything}>
						<TriangleAlert class="base-icon" />
						{$LL.yesDeleteEverything()}
					</Button>
					<Button variant="outline" onclick={() => (confirmReset = false)}>{$LL.cancel()}</Button>
				</div>
			</div>
		{:else}
			<Button variant="outline" onclick={() => (confirmReset = true)}>
				<TriangleAlert class="base-icon text-negative" />
				{$LL.resetEverything()}
			</Button>
		{/if}
	</section>
</SettingsPanel>
