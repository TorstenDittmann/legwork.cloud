<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	const alertTones = {
		info: 'bg-surface-raised text-ink-muted',
		success: 'bg-success/10 text-success',
		warning: 'bg-warning/10 text-warning',
		danger: 'bg-danger/10 text-danger'
	};

	let { tone = 'info', children }: { tone?: keyof typeof alertTones; children: Snippet } = $props();
</script>

<div
	role={tone === 'danger' ? 'alert' : 'status'}
	aria-live="polite"
	class={cn('rounded-lg px-4 py-3 text-sm', alertTones[tone])}
>
	{@render children()}
</div>
