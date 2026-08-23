<script lang="ts">
	import { ArrowRight, Check, LoaderCircle } from '@lucide/svelte';
	import Button from '$lib/components/ui/button.svelte';
	import { cn } from '$lib/utils';
	import type { SetupProgress, SetupStep } from '$lib/setup';

	let {
		progress,
		canManage,
		class: className
	}: {
		progress: SetupProgress;
		canManage: boolean;
		class?: string;
	} = $props();

	const canAct = (step: SetupStep) => canManage || step.id === 'investigation';
</script>

<section
	aria-labelledby="setup-checklist-title"
	class={cn('overflow-hidden rounded-xl border border-rule bg-surface shadow-card', className)}
>
	<div class="border-b border-rule px-5 py-5 sm:px-6">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<p class="text-xs font-semibold tracking-[0.12em] text-accent uppercase">Activation</p>
				<h2
					id="setup-checklist-title"
					class="mt-1 font-display text-xl font-semibold tracking-[-0.005em] text-ink"
				>
					{progress.activated ? 'Workspace ready' : 'Setup checklist'}
				</h2>
			</div>
			<p class="text-sm font-medium text-ink-muted tabular-nums">
				{progress.completedSteps} of {progress.totalSteps} complete
			</p>
		</div>
		<div
			class="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-raised"
			role="progressbar"
			aria-label="Workspace setup progress"
			aria-valuemin="0"
			aria-valuemax={progress.totalSteps}
			aria-valuenow={progress.completedSteps}
		>
			<div
				class="h-full rounded-full bg-accent transition-[width] duration-300"
				style:width={`${(progress.completedSteps / progress.totalSteps) * 100}%`}
			></div>
		</div>
	</div>
	<ol>
		{#each progress.steps as step, index (step.id)}
			{@const active = step.state === 'current' || step.state === 'in-progress'}
			<li
				class={cn(
					'grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 border-b border-rule px-5 py-5 last:border-0 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center sm:px-6',
					active && 'bg-accent-soft/45'
				)}
			>
				<div
					class={cn(
						'row-span-2 grid size-8 place-items-center rounded-full border text-xs font-semibold sm:row-span-1',
						step.state === 'complete'
							? 'border-accent bg-accent text-white'
							: active
								? 'border-accent bg-surface text-accent'
								: 'border-rule-strong bg-surface-raised text-ink-faint'
					)}
					aria-hidden="true"
				>
					{#if step.state === 'complete'}
						<Check class="size-4" strokeWidth={2.5} />
					{:else if step.state === 'in-progress'}
						<LoaderCircle class="size-4 animate-spin" />
					{:else}
						{index + 1}
					{/if}
				</div>
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<h3 class="text-sm font-semibold text-ink">{step.label}</h3>
						{#if step.state === 'complete'}
							<span class="text-xs font-medium text-success">Complete</span>
						{:else if step.state === 'in-progress'}
							<span class="text-xs font-medium text-accent">In progress</span>
						{:else if step.state === 'current'}
							<span class="text-xs font-medium text-accent">Up next</span>
						{/if}
					</div>
					<p class="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">{step.description}</p>
					{#if active && !canAct(step)}
						<p class="mt-2 text-xs font-medium text-warning">
							A workspace admin needs to complete this step.
						</p>
					{/if}
				</div>
				{#if active && canAct(step)}
					<div class="col-start-2 mt-4 sm:col-start-3 sm:mt-0 sm:pl-5">
						<Button href={step.href} size="sm">
							{step.cta}
							<ArrowRight class="size-3.5" aria-hidden="true" />
						</Button>
					</div>
				{:else if step.state === 'complete'}
					<div class="col-start-2 mt-2 sm:col-start-3 sm:mt-0 sm:pl-5">
						<Button href={step.href} size="sm" variant="ghost">Review</Button>
					</div>
				{/if}
			</li>
		{/each}
	</ol>
</section>
