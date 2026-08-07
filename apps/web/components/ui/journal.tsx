import type * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
	eyebrow,
	title,
	description,
	actions,
	fields,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
	actions?: React.ReactNode;
	fields?: React.ReactNode;
}) {
	return (
		<header className="border-b border-rule pb-6">
			<div className="flex flex-wrap items-end justify-between gap-5">
				<div className="min-w-0 max-w-3xl">
					{eyebrow && (
						<p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
							{eyebrow}
						</p>
					)}
					<h1 className="font-display text-pretty text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-ink md:text-4xl">
						{title}
					</h1>
					{description && <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>}
				</div>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
			</div>
			{fields && <div className="mt-6">{fields}</div>}
		</header>
	);
}

/* Hairline-separated metadata cells, the document-header field grid of the
   record motif. Override the column count via className when needed. */
export function RecordFieldGrid({
	className,
	...props
}: React.ComponentProps<"dl">) {
	return (
		<dl
			className={cn(
				"grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-rule bg-rule sm:grid-cols-3",
				className,
			)}
			{...props}
		/>
	);
}

export function RecordField({
	label,
	children,
	className,
}: {
	label: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("min-w-0 bg-surface px-3.5 py-3", className)}>
			<dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">{label}</dt>
			<dd className="mt-1 truncate text-sm text-ink">{children}</dd>
		</div>
	);
}

export function SectionHeader({
	children,
	meta,
}: {
	children: React.ReactNode;
	meta?: React.ReactNode;
}) {
	return (
		<div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
			<h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-ink">{children}</h2>
			{meta && <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">{meta}</div>}
		</div>
	);
}

export function JournalPanel({ className, ...props }: React.ComponentProps<"section">) {
	return (
		<section
			className={cn(
				"rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]",
				className,
			)}
			{...props}
		/>
	);
}

export function EmptyState({
	title,
	children,
	action,
}: {
	title: string;
	children: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<div className="rounded-[4px] border border-dashed border-rule-strong py-12 text-center">
			<p className="font-display text-lg font-semibold text-ink">{title}</p>
			<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{children}</p>
			{action && <div className="mt-5">{action}</div>}
		</div>
	);
}

const alertTones = {
	info: "border-rule-strong text-ink-muted",
	success: "border-success text-success",
	warning: "border-warning text-warning",
	danger: "border-danger text-danger",
};

export function InlineAlert({
	tone = "info",
	children,
}: {
	tone?: keyof typeof alertTones;
	children: React.ReactNode;
}) {
	return (
		<div
			role={tone === "danger" ? "alert" : "status"}
			aria-live="polite"
			className={cn("rounded-r-[3px] border-l-2 bg-surface-raised px-4 py-3 text-sm", alertTones[tone])}
		>
			{children}
		</div>
	);
}
