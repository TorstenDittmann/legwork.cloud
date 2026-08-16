<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppNavigation from '$lib/components/app-navigation.svelte';

	let {
		organizations,
		organizationId,
		email,
		children
	}: {
		organizations: Array<{ id: string; name: string }>;
		organizationId: string;
		email?: string | null;
		children: Snippet;
	} = $props();
</script>

<div class="min-h-screen lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
	<a
		href="#main-content"
		class="fixed top-3 left-3 z-[100] -translate-y-20 rounded-[3px] bg-ink px-3 py-2 text-sm text-canvas transition-transform focus:translate-y-0"
	>
		Skip to Main Content
	</a>
	<AppNavigation {organizations} {organizationId} {email} />
	<main id="main-content" class="min-w-0 px-4 pt-24 pb-16 sm:px-7 lg:px-10 lg:py-10 xl:px-14">
		<div class="mx-auto max-w-[1320px]">{@render children()}</div>
	</main>
</div>
