import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
	"inline-flex items-center gap-1.5 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
	{
		variants: {
			tone: {
				neutral: "border-rule-strong bg-surface text-ink-muted",
				accent: "border-accent/35 bg-accent/5 text-accent",
				success: "border-success/35 bg-success/5 text-success",
				warning: "border-warning/40 bg-warning/5 text-warning",
				danger: "border-danger/35 bg-danger/5 text-danger",
				live: "border-live/35 bg-live/5 text-live",
			},
		},
		defaultVariants: { tone: "neutral" },
	},
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
	className,
	tone,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
