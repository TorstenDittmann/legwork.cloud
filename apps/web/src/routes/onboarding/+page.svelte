<script lang="ts">
	import { enhance } from '$app/forms';
	import Wordmark from '$lib/components/wordmark.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<main class="flex min-h-screen flex-col items-center justify-center px-6 py-16">
	<div class="w-full max-w-md">
		<a href="/" aria-label="Legwork home" class="inline-block"><Wordmark /></a>
		<div class="mt-8 rounded-2xl border border-rule bg-surface shadow-lift">
			<div class="px-7 pt-7 pb-6">
				<p class="text-xs font-semibold tracking-[0.12em] text-accent uppercase">
					Workspace setup · about 2 minutes
				</p>
				<h1 class="font-display text-3xl font-semibold tracking-[-0.01em] text-ink">
					Create your workspace
				</h1>
				<p class="mt-3 text-sm leading-6 text-ink-muted">
					This keeps every repository, service, and incident securely scoped to your team. Next,
					we’ll guide you through connecting your first service.
				</p>
				<form method="POST" action="?/complete" class="mt-7" use:enhance>
					<input type="hidden" name="returnTo" value={data.returnTo} />
					{#if !data.organizationId}
						<label class="block">
							<span class="mb-1.5 block text-sm font-medium text-ink">Organization name</span>
							<Input
								name="name"
								autocomplete="organization"
								required
								minlength={2}
								maxlength={255}
							/>
						</label>
					{/if}
					{#if form?.message}
						<p class="mt-3 text-sm text-danger">{form.message}</p>
					{/if}
					<Button type="submit" class="mt-5 w-full">
						{data.organizationId ? 'Continue workspace setup' : 'Create workspace and continue'}
					</Button>
				</form>
			</div>
		</div>
	</div>
</main>
