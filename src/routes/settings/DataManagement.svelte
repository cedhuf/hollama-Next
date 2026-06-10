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

	import LL from '$i18n/i18n-svelte';
	import Button from '$lib/components/Button.svelte';
	import Fieldset from '$lib/components/Fieldset.svelte';
	import P from '$lib/components/P.svelte';
	import {
		knowledgeStore,
		serversStore,
		sessionsStore,
		settingsStore,
		StorageKey
	} from '$lib/localStorage';
	import { DEFAULT_SETTINGS } from '$lib/settings';

	interface DataSource {
		storageKey: StorageKey;
		fileName: string;
		defaultValue: string;
	}

	const dataSources: DataSource[] = [
		{
			storageKey: StorageKey.HollamaNextServers,
			fileName: `hollama-servers.json`,
			defaultValue: '[]'
		},
		{
			storageKey: StorageKey.HollamaNextPreferences,
			fileName: `hollama-preferences.json`,
			defaultValue: '{}'
		},
		{
			storageKey: StorageKey.HollamaNextSessions,
			fileName: `hollama-sessions.json`,
			defaultValue: '[]'
		},
		{
			storageKey: StorageKey.HollamaNextKnowledge,
			fileName: `hollama-knowledge.json`,
			defaultValue: '[]'
		}
	];

	function exportData(storageKey: StorageKey, fileName: string, defaultValue: string) {
		const data = localStorage.getItem(storageKey) || defaultValue;
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

	// Writes parsed data into both localStorage and its reactive store.
	function applyToStore(storageKey: StorageKey, data: unknown) {
		localStorage.setItem(storageKey, JSON.stringify(data));
		switch (storageKey) {
			case StorageKey.HollamaNextPreferences:
				$settingsStore = data as typeof $settingsStore;
				break;
			case StorageKey.HollamaNextServers:
				$serversStore = data as typeof $serversStore;
				break;
			case StorageKey.HollamaNextSessions:
				$sessionsStore = data as typeof $sessionsStore;
				break;
			case StorageKey.HollamaNextKnowledge:
				$knowledgeStore = data as typeof $knowledgeStore;
				break;
		}
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
				const data = JSON.parse(e.target?.result as string);
				applyToStore(storageKey, data);
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
	function exportBackup() {
		const backup: Record<string, unknown> = {};
		for (const { storageKey, defaultValue } of dataSources) {
			backup[storageKey] = JSON.parse(localStorage.getItem(storageKey) || defaultValue);
		}
		const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `hollama-backup-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
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
				const backup = JSON.parse(e.target?.result as string);
				for (const { storageKey } of dataSources) {
					if (backup[storageKey] === undefined) continue;
					applyToStore(storageKey, backup[storageKey]);
				}
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
		let confirmDelete = '';

		switch (storageKey) {
			case StorageKey.HollamaNextPreferences:
				confirmDelete = $LL.areYouSureYouWantToDeleteAllPreferences();
				break;
			case StorageKey.HollamaNextServers:
				confirmDelete = $LL.areYouSureYouWantToDeleteAllServers();
				break;
			case StorageKey.HollamaNextSessions:
				confirmDelete = $LL.areYouSureYouWantToDeleteAllSessions();
				break;
			case StorageKey.HollamaNextKnowledge:
				confirmDelete = $LL.areYouSureYouWantToDeleteAllKnowledge();
				break;
		}

		if (confirm(confirmDelete)) {
			localStorage.removeItem(storageKey);
			switch (storageKey) {
				case StorageKey.HollamaNextPreferences:
					$settingsStore = DEFAULT_SETTINGS;
					break;
				case StorageKey.HollamaNextServers:
					$serversStore = [];
					break;
				case StorageKey.HollamaNextSessions:
					$sessionsStore = [];
					break;
				case StorageKey.HollamaNextKnowledge:
					$knowledgeStore = [];
					break;
			}
			toast.info($LL.deleteSuccess());
		}
	}

	// Wipes every data source and reloads into a fresh app (re-triggers onboarding).
	function resetEverything() {
		if (!confirm($LL.resetEverythingConfirm())) return;
		for (const storageKey of Object.values(StorageKey)) {
			localStorage.removeItem(storageKey);
		}
		window.location.href = '/';
	}
</script>

<Fieldset>
	<P><strong>Data management</strong></P>

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
					<!-- HACK: because the labels are reactive we need to define them here -->
					{#if dataSource.storageKey === StorageKey.HollamaNextServers}
						<P><strong>{$LL.servers()}</strong></P>
						<span class="text-xs text-muted">{$LL.serversDescription()}</span>
					{:else if dataSource.storageKey === StorageKey.HollamaNextPreferences}
						<P><strong>{$LL.preferences()}</strong></P>
						<span class="text-xs text-muted">{$LL.preferencesDescription()}</span>
					{:else if dataSource.storageKey === StorageKey.HollamaNextSessions}
						<P><strong>{$LL.sessions()}</strong></P>
						<span class="text-xs text-muted">{$LL.sessionsDescription()}</span>
					{:else if dataSource.storageKey === StorageKey.HollamaNextKnowledge}
						<P><strong>{$LL.knowledge()}</strong></P>
						<span class="text-xs text-muted">{$LL.knowledgeDescription()}</span>
					{/if}
				</div>

				<nav class="mt-4 flex justify-between sm:mt-0">
					<Button
						variant="icon"
						onclick={() =>
							exportData(dataSource.storageKey, dataSource.fileName, dataSource.defaultValue)}
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

	<div
		class="mt-2 flex flex-col justify-between gap-2 text-balance rounded-md border border-negative/40 bg-shade-1 p-2 text-sm leading-tight sm:flex-row sm:items-center"
		data-testid="data-management-reset"
	>
		<div class="flex flex-col">
			<P><strong class="text-negative">{$LL.dangerZone()}</strong></P>
			<span class="text-xs text-muted">{$LL.resetEverythingDescription()}</span>
		</div>

		<nav class="mt-4 flex sm:mt-0">
			<Button variant="icon" onclick={resetEverything}>
				<TriangleAlert class="base-icon text-negative" />
				{$LL.resetEverything()}
			</Button>
		</nav>
	</div>
</Fieldset>
