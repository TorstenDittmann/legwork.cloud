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
			<label htmlFor={htmlFor} className="mb-2 block text-xs font-medium text-[var(--ink)]">
				{label}
			</label>
			{children}
			{hint && <p className="mt-1.5 text-xs leading-5 text-[var(--ink-faint)]">{hint}</p>}
		</div>
	);
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
	return (
		<select
			className={cn(
				"h-10 w-full rounded-[3px] border border-[var(--rule-strong)] bg-[var(--canvas)] px-3 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
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
				"min-h-28 w-full resize-y rounded-[3px] border border-[var(--rule-strong)] bg-[var(--canvas)] p-3 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--ink-faint)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
				className,
			)}
			{...props}
		/>
	);
}
