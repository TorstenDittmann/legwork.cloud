import type * as React from "react";
import { cn } from "@/lib/utils";

export function Field({
	label,
	htmlFor,
	hint,
	children,
	className,
}: {
	label: string;
	htmlFor: string;
	hint?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("min-w-0", className)}>
			<label
				htmlFor={htmlFor}
				className="mb-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted"
			>
				{label}
			</label>
			{children}
			{hint && <p className="mt-1.5 text-xs leading-5 text-ink-faint">{hint}</p>}
		</div>
	);
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
	return (
		<select
			className={cn(
				"h-10 w-full rounded-[3px] border border-rule-strong bg-surface px-3 text-sm text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25",
				className,
			)}
			{...props}
		/>
	);
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			className={cn(
				"min-h-28 w-full resize-y rounded-[3px] border border-rule-strong bg-surface p-3 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25",
				className,
			)}
			{...props}
		/>
	);
}
