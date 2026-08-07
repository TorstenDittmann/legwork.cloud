import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
	queued: "bg-[var(--ink-faint)]",
	provisioning: "bg-[var(--warning)]",
	analyzing: "bg-[var(--live)]",
	completed: "bg-[var(--success)]",
	inconclusive: "bg-[var(--warning)]",
	failed: "bg-[var(--danger)]",
	cancelled: "bg-[var(--ink-faint)]",
	enabled: "bg-[var(--success)]",
	disabled: "bg-[var(--ink-faint)]",
};

export function StatusMark({ status, className }: { status: string; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn("size-1.5", statusColors[status] ?? "bg-[var(--ink-faint)]")}
			/>
			{status}
		</span>
	);
}

const severityColors: Record<string, string> = {
	critical: "bg-[var(--critical)]",
	high: "bg-[var(--high)]",
	medium: "bg-[var(--medium)]",
	low: "bg-[var(--low)]",
	unknown: "bg-[var(--ink-faint)]",
};
export function SeverityMark({ severity, className }: { severity: string; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn("h-3 w-0.5", severityColors[severity] ?? severityColors.unknown)}
			/>
			{severity}
		</span>
	);
}
