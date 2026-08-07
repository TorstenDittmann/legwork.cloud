import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const statusTone: Record<string, BadgeTone> = {
	queued: "neutral",
	provisioning: "warning",
	analyzing: "live",
	completed: "success",
	inconclusive: "warning",
	failed: "danger",
	cancelled: "neutral",
	enabled: "success",
	disabled: "neutral",
	pending: "warning",
	passed: "success",
	skipped: "neutral",
};

export function StatusMark({ status, className }: { status: string; className?: string }) {
	return (
		<Badge tone={statusTone[status] ?? "neutral"} className={className}>
			<span aria-hidden="true" className="size-1 bg-current" />
			{status}
		</Badge>
	);
}

const severityScale: Record<string, { level: number; bar: string }> = {
	critical: { level: 4, bar: "bg-critical" },
	high: { level: 3, bar: "bg-high" },
	medium: { level: 2, bar: "bg-medium" },
	low: { level: 1, bar: "bg-low" },
};
const tickHeights = ["h-[5px]", "h-[7px]", "h-[9px]", "h-[11px]"];

export function SeverityMark({ severity, className }: { severity: string; className?: string }) {
	const { level, bar } = severityScale[severity] ?? { level: 0, bar: "bg-ink-faint" };
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted",
				className,
			)}
		>
			<span aria-hidden="true" className="flex items-end gap-[2px]">
				{tickHeights.map((height, index) => (
					<span
						key={height}
						className={cn("w-[3px]", height, index < level ? bar : "bg-rule-strong")}
					/>
				))}
			</span>
			{severity}
		</span>
	);
}
