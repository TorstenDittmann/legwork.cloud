<script lang="ts">
	import { cn } from '$lib/utils';

	const severityDot: Record<string, string> = {
		critical: 'bg-critical',
		high: 'bg-high',
		medium: 'bg-medium',
		low: 'bg-low'
	};

	let { severity, class: className }: { severity: string; class?: string } = $props();

	const dot = $derived(severityDot[severity] ?? 'bg-ink-faint/50');
</script>

<span class={cn('inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted', className)}>
	<span aria-hidden="true" class={cn('size-2 rounded-full', dot)}></span>
	<span class="capitalize">{severity}</span>
</span>
