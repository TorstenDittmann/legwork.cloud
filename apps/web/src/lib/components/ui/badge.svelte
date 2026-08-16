<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cva } from 'class-variance-authority';
	import { cn } from '$lib/utils';

	const badgeVariants = cva(
		'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
		{
			variants: {
				tone: {
					neutral: 'bg-surface-raised text-ink-muted',
					accent: 'bg-accent-soft text-accent',
					success: 'bg-success/10 text-success',
					warning: 'bg-warning/10 text-warning',
					danger: 'bg-danger/10 text-danger',
					live: 'bg-live/10 text-live'
				}
			},
			defaultVariants: { tone: 'neutral' }
		}
	);

	let {
		tone = 'neutral',
		class: className,
		children,
		...rest
	}: {
		tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'live';
		class?: string;
		children: Snippet;
	} & HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span class={cn(badgeVariants({ tone }), className)} {...rest}>{@render children()}</span>
