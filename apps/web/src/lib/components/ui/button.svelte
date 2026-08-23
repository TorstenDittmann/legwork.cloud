<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { cva } from 'class-variance-authority';
	import { cn } from '$lib/utils';

	const variants = cva(
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-transparent px-4 text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:min-h-10',
		{
			variants: {
				variant: {
					default: 'bg-accent text-white shadow-sm hover:bg-accent-hover',
					outline:
						'border-rule-strong bg-surface text-ink shadow-xs hover:border-ink-faint hover:bg-surface-raised',
					ghost: 'text-ink-muted hover:bg-surface-raised hover:text-ink',
					destructive: 'bg-danger text-white shadow-sm hover:brightness-95',
					link: 'min-h-0 px-0 text-accent underline-offset-4 hover:underline'
				},
				size: {
					default: 'h-11 sm:h-10',
					sm: 'h-11 px-3 text-xs sm:min-h-9 sm:h-9',
					lg: 'h-12 px-6 text-base'
				}
			},
			defaultVariants: { variant: 'default', size: 'default' }
		}
	);

	let {
		variant = 'default',
		size = 'default',
		href,
		class: className,
		children,
		...rest
	}: {
		variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'link';
		size?: 'default' | 'sm' | 'lg';
		href?: string;
		class?: string;
		children: Snippet;
	} & HTMLButtonAttributes &
		HTMLAnchorAttributes = $props();
</script>

{#if href}
	<a {href} class={cn(variants({ variant, size }), className)} {...rest}>{@render children()}</a>
{:else}
	<button class={cn(variants({ variant, size }), className)} {...rest}>{@render children()}</button>
{/if}
