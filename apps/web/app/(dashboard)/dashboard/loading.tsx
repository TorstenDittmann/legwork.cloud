import { PageHeader, SectionHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
	const month = new Date();
	month.setUTCDate(1);
	return (
		<>
			<LoadingStatus label="Loading incident overview" />
			<PageHeader
				eyebrow="Operational briefing"
				title="Incident Overview"
				description={new Intl.DateTimeFormat("en", {
					month: "long",
					year: "numeric",
					timeZone: "UTC",
				}).format(month)}
			/>
			<div className="mt-7 grid gap-px overflow-hidden rounded-[4px] border border-rule bg-rule sm:grid-cols-3">
				{["Services", "Incidents this month", "Active analyses"].map((label) => (
					<div key={label} className="bg-surface px-5 py-4">
						<p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">{label}</p>
						<Skeleton className="mt-3 h-8 w-14" />
					</div>
				))}
			</div>
			<section className="mt-12">
				<SectionHeader>Recent Incidents</SectionHeader>
				<div className="divide-y divide-rule rounded-[4px] border border-rule bg-surface">
					{[0, 1, 2, 3].map((row) => (
						<div key={row} className="grid gap-3 px-4 py-4 sm:grid-cols-[100px_minmax(0,1fr)_140px_120px]">
							<Skeleton className="h-5 w-16" />
							<Skeleton className="h-5 w-3/4" />
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-5 w-20" />
						</div>
					))}
				</div>
			</section>
		</>
	);
}
