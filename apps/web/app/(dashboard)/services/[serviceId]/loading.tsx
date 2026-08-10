import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function ServiceLoading() {
	return (
		<>
			<LoadingStatus label="Loading service" />
			<header className="border-b border-rule pb-6">
				<p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">Service specification</p>
				<Skeleton className="h-10 w-64 max-w-full" />
				<Skeleton className="mt-3 h-4 w-96 max-w-full" />
			</header>
			<div className="mt-8 grid gap-4 md:grid-cols-2">
				{["Ingestion", "Repositories"].map((title) => (
					<Card key={title}>
						<CardHeader><CardTitle>{title}</CardTitle></CardHeader>
						<div className="px-6 pb-6">
							<Skeleton className="h-4 w-4/5" />
							<Skeleton className="mt-3 h-4 w-3/5" />
						</div>
					</Card>
				))}
			</div>
			<Card className="mt-6 p-6"><Skeleton className="h-40 w-full" /></Card>
		</>
	);
}
