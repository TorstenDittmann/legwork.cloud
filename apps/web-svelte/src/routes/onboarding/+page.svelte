<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<main class="flex min-h-screen flex-col items-center justify-center journal-grid px-6 py-16">
	<div class="w-full max-w-lg">
		<p class="font-display text-lg font-semibold tracking-[-0.01em]">
			OnCall <span class="text-accent">AI</span>
		</p>
		<div
			class="mt-8 rounded-[4px] border border-rule bg-surface shadow-[0_16px_40px_-16px_rgba(23,26,32,0.16),0_2px_6px_rgba(23,26,32,0.05)]"
		>
			<div class="border-b border-rule px-6 py-3">
				<p class="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">
					Workspace setup · 01
				</p>
			</div>
			<div class="px-6 py-7">
				<h1 class="font-display text-3xl font-semibold tracking-[-0.02em]">
					Create Your Workspace
				</h1>
				<p class="mt-3 text-sm leading-6 text-ink-muted">
					Every repository, service, incident, and run is scoped to the active WorkOS organization.
				</p>
				<form method="POST" action="?/complete" class="mt-7" use:enhance>
					{#if !data.organizationId}
						<label class="block">
							<span
								class="mb-2 block font-mono text-[10px] tracking-[0.08em] text-ink-muted uppercase"
							>
								Organization name
							</span>
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
						{data.organizationId ? 'Finish organization setup' : 'Create organization'}
					</Button>
				</form>
			</div>
		</div>
	</div>
</main>
