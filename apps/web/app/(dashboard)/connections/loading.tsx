import { PageHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function ConnectionsLoading() {
	return (
		<>
			<LoadingStatus label="Loading connections" />
			<PageHeader
				eyebrow="Organization integrations"
				title="Connections"
				description="Connect observability tools once, then choose which services can use their read-only context."
			/>
			<div className="mt-8 grid gap-4 lg:grid-cols-2">
				{[0, 1].map((card) => (
					<div key={card} className="rounded-[4px] border border-rule bg-surface p-5">
						<Skeleton className="h-6 w-40" />
						<Skeleton className="mt-5 h-4 w-3/4" />
						<Skeleton className="mt-3 h-4 w-full" />
						<Skeleton className="mt-3 h-4 w-2/3" />
					</div>
				))}
			</div>
			<div className="mt-8 rounded-[4px] border border-dashed border-rule-strong p-5">
				<Skeleton className="h-6 w-48" />
				<Skeleton className="mt-3 h-4 w-80 max-w-full" />
			</div>
		</>
	);
}
