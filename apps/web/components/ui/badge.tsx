import type * as React from "react";
import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-[2px] border border-[var(--rule-strong)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]",
				className,
			)}
			{...props}
		/>
	);
}
