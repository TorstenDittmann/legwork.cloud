import type * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
	eyebrow,
	title,
	description,
	actions,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
	actions?: React.ReactNode;
}) {
	return (
		<header className="border-b border-[var(--rule)] pb-6">
			<div className="flex flex-wrap items-end justify-between gap-5">
				<div className="min-w-0 max-w-3xl">
					{eyebrow && (
						<p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
							{eyebrow}
						</p>
					)}
					<h1 className="font-display text-pretty text-4xl font-medium leading-[1.05] tracking-[-0.025em] text-[var(--ink)] md:text-5xl">
						{title}
					</h1>
					{description && (
						<p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
							{description}
						</p>
					)}
				</div>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
			</div>
		</header>
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
		<div className="mb-3 flex items-baseline justify-between gap-4 border-b border-[var(--rule)] pb-2">
			<h2 className="font-display text-2xl font-medium text-[var(--ink)]">{children}</h2>
			{meta && (
				<div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
					{meta}
				</div>
			)}
		</div>
	);
}

export function JournalPanel({ className, ...props }: React.ComponentProps<"section">) {
	return (
		<section
			className={cn("border border-[var(--rule)] bg-[var(--surface)]", className)}
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
		<div className="border-y border-[var(--rule)] py-10 text-center">
			<p className="font-display text-xl text-[var(--ink)]">{title}</p>
			<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ink-muted)]">{children}</p>
			{action && <div className="mt-5">{action}</div>}
		</div>
	);
}

export function InlineAlert({
	tone = "info",
	children,
}: {
	tone?: "info" | "success" | "warning" | "danger";
	children: React.ReactNode;
}) {
	const colors = {
		info: "var(--ink-muted)",
		success: "var(--success)",
		warning: "var(--warning)",
		danger: "var(--danger)",
	};
	return (
		<div
			role={tone === "danger" ? "alert" : "status"}
			aria-live="polite"
			className="border-l-2 bg-[var(--surface-raised)] px-4 py-3 text-sm"
			style={{ borderColor: colors[tone], color: colors[tone] }}
		>
			{children}
		</div>
	);
}
