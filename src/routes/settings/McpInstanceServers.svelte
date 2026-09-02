<script lang="ts">
	import { onMount } from 'svelte';

	import LL from '$i18n/i18n-svelte';
	import ButtonConfirm from '$lib/components/ButtonConfirm.svelte';
	import type { McpServerView } from '$lib/mcp';
	import { toast } from '$lib/toast';

	/**
	 * Every MCP server on the instance, with whose it is. The counterpart of the
	 * permission it sits under: granting the right to open outbound connections with
	 * no way to see or stop what was opened is clearly wrong.
	 *
	 * A roster and not a second editor: two questions answered, two actions. An
	 * administrator who could rewrite somebody's address or token would be pointing
	 * their tools at a machine of their own choosing.
	 */
	let servers = $state<(McpServerView & { owner: string })[]>([]);

	async function load() {
		try {
			const response = await fetch('/api/admin/mcp');
			if (response.ok) servers = await response.json();
		} catch {
			// A roster that will not load is not worth an error over the permission above
			// it, which works.
		}
	}

	onMount(load);

	/** The switch reads as "allowed", so it is on when nothing is blocking it. What it writes is the instance's decision, never the owner's. */
	async function setAllowed(server: McpServerView, allowed: boolean) {
		const response = await fetch(`/api/admin/mcp/${server.id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ blocked: !allowed })
		});
		if (!response.ok) return toast.error($LL.requestFailed());
		await load();
	}

	async function remove(id: string) {
		const response = await fetch(`/api/admin/mcp/${id}`, { method: 'DELETE' });
		if (!response.ok) return toast.error($LL.requestFailed());
		servers = servers.filter((entry) => entry.id !== id);
	}
</script>

{#if servers.length}
	<div class="mt-1 flex flex-col gap-2">
		{#each servers as server (server.id)}
			<div class="border-shade-3 bg-shade-0 flex items-center gap-3 rounded-xl border px-3 py-2">
				<span class="min-w-0 flex-1">
					<span class="text-active block truncate text-sm">{server.label}</span>
					<span class="text-muted block truncate text-xs">
						{server.owner} · {server.url}
						{#if !server.enabled}· {$LL.offByItsOwner()}{/if}
					</span>
				</span>

				<label class="flex shrink-0 cursor-pointer items-center" title={$LL.mcpAllowed()}>
					<input
						type="checkbox"
						class="peer sr-only"
						checked={!server.blocked}
						onchange={(e) => setAllowed(server, e.currentTarget.checked)}
					/>
					<span
						class="bg-shade-3 peer-checked:bg-accent peer-focus-visible:ring-accent relative h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
					></span>
				</label>

				<ButtonConfirm onConfirm={() => remove(server.id)} label={$LL.deleteMcpServer()} compact />
			</div>
		{/each}
	</div>
{/if}
