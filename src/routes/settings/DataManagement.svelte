<script lang="ts">
	import {
		Archive,
		ArchiveRestore,
		Download,
		FolderUp,
		Trash2,
		TriangleAlert
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { get, type Writable } from 'svelte/store';

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import P from '$lib/components/P.svelte';
	import { repository } from '$lib/data';
	import { applyBackupToStores, applyToStore } from '$lib/data/applyBackup';
	import {
		knowledgeStore,
		personasStore,
		serversStore,
		sessionsStore,
		settingsStore,
		StorageKey
	} from '$lib/localStorage';
	import { DEFAULT_SETTINGS } from '$lib/settings';

	import SettingsSection from './SettingsSection.svelte';

	// Maps each storage key to its reactive store, for generic per-category ops.
	const stores: Record<StorageKey, Writable<unknown>> = {
		[StorageKey.HollamaNextPreferences]: settingsStore,
		[StorageKey.HollamaNextServers]: serversStore,
		[StorageKey.HollamaNextSessions]: sessionsStore,
		[StorageKey.HollamaNextKnowledge]: knowledgeStore,
		[StorageKey.HollamaNextPersonas]: personasStore
	};

	// Triggers a browser download of `data` as a JSON file.
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

	// Reactive (labels come from $LL) — one source of truth for the per-category rows.
	const dataSources = $derived<DataSource[]>([
		{
			storageKey: StorageKey.HollamaNextServers,
			fileName: `hollama-servers.json`,
			label: $LL.servers(),
			description: $LL.serversDescription()
		},
		{
			storageKey: StorageKey.HollamaNextPreferences,
			fileName: `hollama-preferences.json`,
			label: $LL.preferences(),
			description: $LL.preferencesDescription()
		},
		{
			storageKey: StorageKey.HollamaNextSessions,
			fileName: `hollama-sessions.json`,
			label: $LL.sessions(),
			description: $LL.sessionsDescription()
		},
		{
			storageKey: StorageKey.HollamaNextKnowledge,
			fileName: `hollama-knowledge.json`,
			label: $LL.knowledge(),
			description: $LL.knowledgeDescription()
		},
		{
			storageKey: StorageKey.HollamaNextPersonas,
			fileName: `hollama-personas.json`,
			label: 'Personas',
			description: 'Your saved characters and their settings'
		}
	]);

	// The value a category resets to when deleted.
	const defaults: Record<StorageKey, unknown> = {
		[StorageKey.HollamaNextPreferences]: DEFAULT_SETTINGS,
		[StorageKey.HollamaNextServers]: [],
		[StorageKey.HollamaNextSessions]: [],
		[StorageKey.HollamaNextKnowledge]: [],
		[StorageKey.HollamaNextPersonas]: []
	};

	function exportData(storageKey: StorageKey, fileName: string) {
		download(JSON.stringify(get(stores[storageKey])), fileName);
	}

	function importData(event: Event, storageKey: StorageKey) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0];

		if (!confirm($LL.areYouSureYouWantToImportData())) {
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

	// Exports every data source into a single backup file.
	async function exportBackup() {
		const backup = await repository.exportBackup();
		download(
			JSON.stringify(backup, null, 2),
			`hollama-backup-${new Date().toISOString().slice(0, 10)}.json`
		);
	}

	// Restores every data source from a single backup file.
	function importBackup(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0];

		if (!confirm($LL.areYouSureYouWantToImportData())) {
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

	function deleteData(storageKey: StorageKey) {
		const confirmMessages: Record<StorageKey, string> = {
			[StorageKey.HollamaNextPreferences]: $LL.areYouSureYouWantToDeleteAllPreferences(),
			[StorageKey.HollamaNextServers]: $LL.areYouSureYouWantToDeleteAllServers(),
			[StorageKey.HollamaNextSessions]: $LL.areYouSureYouWantToDeleteAllSessions(),
			[StorageKey.HollamaNextKnowledge]: $LL.areYouSureYouWantToDeleteAllKnowledge(),
			[StorageKey.HollamaNextPersonas]: 'Are you sure you want to delete all personas?'
		};

		if (confirm(confirmMessages[storageKey])) {
			stores[storageKey].set(defaults[storageKey]);
			toast.info($LL.deleteSuccess());
		}
	}

	let confirmReset = $state(false);

	// Wipes every data source and reloads into a fresh app (re-triggers onboarding).
	async function resetEverything() {
		if (!confirmReset) {
			confirmReset = true;
			return;
		}
		await repository.resetAll();
		window.location.href = '/';
	}
</script>

<div class="flex flex-col gap-5">
	<input
		id="import-backup-input"
		type="file"
		accept="application/json"
		style="display: none;"
		onchange={importBackup}
	/>
	<div
		class="inline-flex w-full flex-col justify-between gap-x-2 text-balance rounded-md border border-accent/40 bg-shade-1 p-2 text-sm leading-tight sm:flex-row sm:items-center"
		data-testid="data-management-backup"
	>
		<div class="flex flex-col">
			<P><strong>Backup &amp; restore</strong></P>
			<span class="text-xs text-muted"
				>Export or import everything (sessions, knowledge, servers, preferences) in a single file</span
			>
		</div>

		<nav class="mt-4 flex justify-between gap-x-2 sm:mt-0">
			<Button variant="icon" onclick={exportBackup}>
				<Archive class="base-icon" />
				Backup
			</Button>
			<Button
				variant="icon"
				onclick={() => document.getElementById('import-backup-input')?.click()}
			>
				<ArchiveRestore class="base-icon" />
				Restore
			</Button>
		</nav>
	</div>

	<SettingsSection
		title="By category"
		description="Export, import or delete each kind of data on its own."
	>
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
					class="inline-flex w-full flex-grow flex-col justify-between gap-x-2 text-balance rounded-md border border-shade-4 p-2 text-sm leading-tight sm:flex-row sm:items-center"
				>
					<div class="flex flex-col">
						<P><strong>{dataSource.label}</strong></P>
						<span class="text-xs text-muted">{dataSource.description}</span>
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

	<div
		class="flex flex-col gap-2 rounded-md border border-negative/40 bg-shade-1 p-4 text-sm"
		data-testid="data-management-reset"
	>
		<P><strong class="text-negative">{$LL.dangerZone()}</strong></P>
		<span class="text-xs text-muted">{$LL.resetEverythingDescription()}</span>

		{#if confirmReset}
			<div class="flex flex-col gap-2 rounded-md border border-negative/30 bg-shade-0 p-3">
				<span class="text-sm font-medium text-negative">Are you sure? This cannot be undone.</span>
				<div class="flex gap-2">
					<Button variant="default" class="!bg-negative !text-shade-0" onclick={resetEverything}>
						<TriangleAlert class="base-icon" />
						Yes, delete everything
					</Button>
					<Button variant="outline" onclick={() => (confirmReset = false)}>Cancel</Button>
				</div>
			</div>
		{:else}
			<Button variant="outline" onclick={() => (confirmReset = true)}>
				<TriangleAlert class="base-icon text-negative" />
				{$LL.resetEverything()}
			</Button>
		{/if}
	</div>
</div>
