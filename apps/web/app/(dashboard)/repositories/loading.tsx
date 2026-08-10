import { PageHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function RepositoriesLoading() {
	return (
		<>
			<LoadingStatus label="Loading repositories" />
			<PageHeader
				eyebrow="Read-only GitHub App"
				title="Repositories"
				description="Included repositories provide source, recent Actions runs, and deployment context during investigations. Installation credentials remain worker-only."
			/>
			<section className="mt-7">
				<div className="flex items-end justify-between border-b border-rule pb-4">
					<div>
						<h2 className="font-display text-lg font-semibold">Repository inventory</h2>
						<Skeleton className="mt-2 h-3 w-36" />
					</div>
					<Skeleton className="h-9 w-72" />
				</div>
				<div className="mt-3 divide-y divide-rule rounded-[4px] border border-rule bg-surface">
					{[0, 1, 2, 3, 4].map((row) => (
						<div key={row} className="grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,1fr)_180px_110px_104px]">
							<Skeleton className="h-5 w-52 max-w-full" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-5 w-16" />
							<Skeleton className="h-8 w-20" />
						</div>
					))}
				</div>
			</section>
		</>
	);
}
