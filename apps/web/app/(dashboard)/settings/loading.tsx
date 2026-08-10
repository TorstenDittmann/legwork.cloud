import { PageHeader, SectionHeader } from "@/components/ui/journal";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
	return (
		<>
			<LoadingStatus label="Loading organization settings" />
			<PageHeader
				eyebrow="Organization"
				title="Settings"
				description="Manage usage, access, credentials, and the organization audit record."
			/>
			<div className="mt-8 grid gap-5 lg:grid-cols-2">
				{["Monthly usage", "Active API keys"].map((title) => (
					<div key={title} className="rounded-[4px] border border-rule bg-surface p-5">
						<h2 className="font-display font-semibold">{title}</h2>
						<Skeleton className="mt-5 h-4 w-48" />
						<Skeleton className="mt-3 h-2 w-full" />
						<Skeleton className="mt-5 h-4 w-64 max-w-full" />
					</div>
				))}
			</div>
			<section className="mt-10">
				<SectionHeader>Members & Invitations</SectionHeader>
				<Skeleton className="h-10 w-full max-w-xl" />
				<div className="mt-4 rounded-[4px] border border-rule bg-surface p-5">
					{[0, 1, 2].map((row) => (
						<Skeleton key={row} className="mb-4 h-8 w-full last:mb-0" />
					))}
				</div>
			</section>
		</>
	);
}
