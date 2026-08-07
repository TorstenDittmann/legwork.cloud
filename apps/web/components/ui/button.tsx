import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variants = cva(
	"inline-flex min-h-10 items-center justify-center gap-2 rounded-[3px] border border-transparent px-4 text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)]",
	{
		variants: {
			variant: {
				default: "bg-[var(--accent)] text-[#160d09] hover:bg-[var(--accent-hover)]",
				outline:
					"border-[var(--rule-strong)] bg-transparent text-[var(--ink)] hover:border-[var(--ink-muted)] hover:bg-[var(--surface-raised)]",
				ghost: "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
				destructive: "bg-[var(--danger)] text-[#190b09] hover:brightness-110",
				link: "min-h-0 px-0 text-[var(--accent)] underline-offset-4 hover:underline",
			},
			size: { default: "h-10", sm: "min-h-8 h-8 px-3 text-xs", lg: "h-12 px-6" },
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);
export function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> & VariantProps<typeof variants> & { asChild?: boolean }) {
	const Component = asChild ? Slot : "button";
	return <Component className={cn(variants({ variant, size }), className)} {...props} />;
}
