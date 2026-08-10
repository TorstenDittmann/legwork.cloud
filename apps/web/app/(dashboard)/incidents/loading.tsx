import { PageHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function IncidentsLoading() {
	return (
		<>
			<LoadingStatus label="Loading incidents" />
			<PageHeader
				eyebrow="30-day retention"
				title="Incident Ledger"
				description="Every report, run, and verified conclusion in chronological order."
			/>
			<div className="mt-7 grid gap-3 rounded-[4px] border border-rule bg-surface p-4 md:grid-cols-6">
				{["Status", "Severity", "Service", "From", "To"].map((label) => (
					<div key={label}>
						<p className="mb-2 text-xs text-ink-muted">{label}</p>
						<Skeleton className="h-9 w-full" />
					</div>
				))}
				<Skeleton className="mt-6 h-9 w-full" />
			</div>
			<div className="mt-8 divide-y divide-rule rounded-[4px] border border-rule bg-surface">
				{[0, 1, 2, 3, 4].map((row) => (
					<div key={row} className="grid gap-3 px-4 py-4 sm:grid-cols-[90px_minmax(0,1fr)_130px_110px]">
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-5 w-4/5" />
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-5 w-20" />
					</div>
				))}
			</div>
		</>
	);
}
