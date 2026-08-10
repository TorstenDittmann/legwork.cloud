import { PageHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function NewServiceLoading() {
	return (
		<>
			<LoadingStatus label="Loading service form" />
			<PageHeader
				eyebrow="Configuration"
				title="New Service"
				description="Create a stable incident endpoint and bind it to the repositories the agent may inspect."
			/>
			<div className="mt-8 grid max-w-3xl gap-5">
				{["Name", "Slug", "Repositories"].map((label, index) => (
					<div key={label}>
						<p className="mb-2 text-xs text-ink-muted">{label}</p>
						<Skeleton className={index === 2 ? "h-32 w-full" : "h-10 w-full"} />
					</div>
				))}
			</div>
		</>
	);
}
