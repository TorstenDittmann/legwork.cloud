<script lang="ts">
	import { Check, Clock3, RefreshCw, TriangleAlert } from '@lucide/svelte';
	import Wordmark from '$lib/components/wordmark.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import { planName } from '$lib/pricing';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const active = $derived(data.subscription?.status === 'active');
	const failed = $derived(
		data.checkoutStatus === 'failed' ||
			data.checkoutStatus === 'cancelled' ||
			data.subscription?.status === 'failed'
	);
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="flex min-h-screen flex-col px-5 py-6 sm:px-8">
	<header class="mx-auto flex w-full max-w-[1100px] items-center justify-between">
		<a href="/" aria-label="Legwork home"><Wordmark /></a>
		<a href="/pricing" class="text-sm text-ink-muted hover:text-ink">Pricing</a>
	</header>

	<div class="mx-auto grid w-full max-w-xl flex-1 place-items-center py-16">
		<section
			class="w-full rounded-2xl border border-rule bg-surface px-7 py-9 text-center shadow-lift sm:px-10 sm:py-11"
		>
			{#if active}
				<span
					class="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent"
				>
					<Check aria-hidden="true" class="size-6" strokeWidth={2.5} />
				</span>
				<p class="mt-5 font-mono text-xs tracking-[0.12em] text-accent uppercase">Plan active</p>
				<h1 class="mt-2 font-display text-4xl font-semibold tracking-[-0.02em] text-ink">
					You’re on {planName(data.subscription?.plan ?? 'developer')}.
				</h1>
				<p class="mx-auto mt-4 max-w-md text-sm leading-6 text-ink-muted">
					Your organization limits are updated and the extra investigation capacity is ready to use.
				</p>
			{:else if failed}
				<span class="bg-red-50 mx-auto grid size-12 place-items-center rounded-full text-danger">
					<TriangleAlert aria-hidden="true" class="size-6" />
				</span>
				<p class="mt-5 font-mono text-xs tracking-[0.12em] text-danger uppercase">Not completed</p>
				<h1 class="mt-2 font-display text-4xl font-semibold tracking-[-0.02em] text-ink">
					No plan change was made.
				</h1>
				<p class="mx-auto mt-4 max-w-md text-sm leading-6 text-ink-muted">
					The payment was cancelled or could not be completed. You can safely try checkout again.
				</p>
			{:else}
				<span class="bg-amber-50 mx-auto grid size-12 place-items-center rounded-full text-warning">
					<Clock3 aria-hidden="true" class="size-6" />
				</span>
				<p class="mt-5 font-mono text-xs tracking-[0.12em] text-warning uppercase">
					Syncing securely
				</p>
				<h1 class="mt-2 font-display text-4xl font-semibold tracking-[-0.02em] text-ink">
					We’re confirming your plan.
				</h1>
				<p class="mx-auto mt-4 max-w-md text-sm leading-6 text-ink-muted">
					Dodo Payments has returned you to Legwork. Access changes only after the signed billing
					webhook arrives, which can take a moment.
				</p>
			{/if}

			<div class="mt-8 flex flex-wrap justify-center gap-3">
				<Button href="/dashboard" size="lg">Open dashboard</Button>
				{#if !active && !failed}
					<Button href="/checkout/success" size="lg" variant="outline">
						<RefreshCw aria-hidden="true" class="size-4" />
						Check again
					</Button>
				{:else if failed}
					<Button href="/pricing" size="lg" variant="outline">Back to pricing</Button>
				{/if}
			</div>
		</section>
	</div>
</main>
