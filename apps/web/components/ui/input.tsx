import type * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			className={cn(
				"h-10 w-full rounded-[3px] border border-rule-strong bg-surface px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
