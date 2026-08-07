import type * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			className={cn(
				"h-10 w-full rounded-[3px] border border-[var(--rule-strong)] bg-[var(--canvas)] px-3 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--ink-faint)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
