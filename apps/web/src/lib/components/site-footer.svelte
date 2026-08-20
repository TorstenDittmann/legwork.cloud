<script lang="ts">
	import Wordmark from '$lib/components/wordmark.svelte';

	const links = [
		{ label: 'Docs', href: '/docs' },
		{ label: 'Security', href: '/security' },
		{ label: 'Pricing', href: '/pricing' },
		{ label: 'Terms', href: '/terms' },
		{ label: 'Privacy', href: '/privacy' }
	];
</script>

<footer class="border-t border-rule">
	<div
		class="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-10 gap-y-5 px-5 py-8 sm:px-8"
	>
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<a href="/" aria-label="Legwork home"><Wordmark /></a>
			<p class="text-xs text-ink-faint">© 2026 Legwork</p>
		</div>
		<nav aria-label="Footer">
			<ul class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
				{#each links as link (link.href)}
					<li>
						<a href={link.href} class="text-ink-muted hover:text-ink">{link.label}</a>
					</li>
				{/each}
				<li>
					<a href="mailto:hello@legwork.cloud" class="text-ink-muted hover:text-ink">
						hello@legwork.cloud
					</a>
				</li>
			</ul>
		</nav>
	</div>
</footer>
