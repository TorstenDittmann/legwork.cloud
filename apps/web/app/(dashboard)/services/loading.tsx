import { PageHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function ServicesLoading() {
	return (
		<>
			<LoadingStatus label="Loading services" />
			<PageHeader
				eyebrow="Configuration"
				title="Services"
				description="Map incident intake endpoints to the repositories that explain them."
			/>
			<div className="mt-8 divide-y divide-rule rounded-[4px] border border-rule bg-surface">
				{[0, 1, 2, 3].map((row) => (
					<div key={row} className="grid gap-3 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_140px]">
						<div>
							<Skeleton className="h-6 w-48" />
							<Skeleton className="mt-2 h-3 w-64 max-w-full" />
						</div>
						<Skeleton className="h-5 w-20" />
					</div>
				))}
			</div>
		</>
	);
}
