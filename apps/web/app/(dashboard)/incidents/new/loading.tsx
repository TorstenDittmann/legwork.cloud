import { PageHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function NewIncidentLoading() {
	return (
		<>
			<LoadingStatus label="Loading incident form" />
			<PageHeader
				eyebrow="Manual intake"
				title="Submit an Incident"
				description="Provide the failure signal and enough operational context to begin a repository investigation."
			/>
			<div className="mt-8 grid max-w-3xl gap-5">
				{["Service", "Title", "Severity", "Description"].map((label, index) => (
					<div key={label}>
						<p className="mb-2 text-xs text-ink-muted">{label}</p>
						<Skeleton className={index === 3 ? "h-28 w-full" : "h-10 w-full"} />
					</div>
				))}
			</div>
		</>
	);
}
