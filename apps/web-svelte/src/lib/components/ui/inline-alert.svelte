<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	const alertTones = {
		info: 'border-rule-strong text-ink-muted',
		success: 'border-success text-success',
		warning: 'border-warning text-warning',
		danger: 'border-danger text-danger'
	};

	let { tone = 'info', children }: { tone?: keyof typeof alertTones; children: Snippet } = $props();
</script>

<div
	role={tone === 'danger' ? 'alert' : 'status'}
	aria-live="polite"
	class={cn('rounded-r-[3px] border-l-2 bg-surface-raised px-4 py-3 text-sm', alertTones[tone])}
>
	{@render children()}
</div>
