<script lang="ts">
	import { cn } from '$lib/utils';

	const severityScale: Record<string, { level: number; bar: string }> = {
		critical: { level: 4, bar: 'bg-critical' },
		high: { level: 3, bar: 'bg-high' },
		medium: { level: 2, bar: 'bg-medium' },
		low: { level: 1, bar: 'bg-low' }
	};
	const tickHeights = ['h-[5px]', 'h-[7px]', 'h-[9px]', 'h-[11px]'];

	let { severity, class: className }: { severity: string; class?: string } = $props();

	const scale = $derived(severityScale[severity] ?? { level: 0, bar: 'bg-ink-faint' });
</script>

<span
	class={cn(
		'inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-muted uppercase',
		className
	)}
>
	<span aria-hidden="true" class="flex items-end gap-[2px]">
		{#each tickHeights as height, index (height)}
			<span class={cn('w-[3px]', height, index < scale.level ? scale.bar : 'bg-rule-strong')}
			></span>
		{/each}
	</span>
	{severity}
</span>
