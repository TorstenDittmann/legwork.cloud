import { RecordFieldGrid, SectionHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export function IncidentLoading() {
	return (
		<>
			<LoadingStatus label="Loading incident record" />
			<header className="border-b border-rule pb-7">
				<a href="/incidents" className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
					← Incident Ledger
				</a>
				<div className="mt-5">
					<div className="mb-3 flex gap-3">
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-5 w-20" />
					</div>
					<Skeleton className="h-12 w-[38rem] max-w-full" />
				</div>
				<RecordFieldGrid className="mt-6 lg:grid-cols-5">
					{["Service", "Environment", "Occurred", "Analysis duration"].map((label) => (
						<div key={label} className="bg-surface px-3.5 py-3">
							<p className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">{label}</p>
							<Skeleton className="mt-2 h-4 w-24" />
						</div>
					))}
				</RecordFieldGrid>
			</header>
			<section className="mt-9">
				<SectionHeader>Run Progress</SectionHeader>
				<div className="grid grid-cols-2 gap-px rounded-[4px] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
					{["Queued", "Provisioning", "Repositories", "Analyzing", "Synthesis", "Complete"].map((stage) => (
						<div key={stage} className="bg-surface p-4">
							<p className="text-xs text-ink-faint">{stage}</p>
							<Skeleton className="mt-3 h-2 w-full" />
						</div>
					))}
				</div>
			</section>
		</>
	);
}
