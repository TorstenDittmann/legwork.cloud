import { withAuth } from "@workos-inc/authkit-nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeOnboarding } from "./complete/actions";

export default async function OnboardingPage() {
	const session = await withAuth({ ensureSignedIn: true });
	return (
		<main className="journal-grid mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
			<p className="font-display text-xl">
				OnCall <i className="text-[var(--accent)]">AI</i>
			</p>
			<p className="mt-14 font-mono text-[10px] uppercase tracking-[.18em] text-[var(--accent)]">
				Workspace setup · 01
			</p>
			<h1 className="mt-4 font-display text-5xl font-medium tracking-tight">
				Create Your Workspace
			</h1>
			<p className="mt-5 max-w-xl text-sm leading-6 text-[var(--ink-muted)]">
				Every repository, service, incident, and run is scoped to the active WorkOS organization.
			</p>
			<form
				action={completeOnboarding}
				className="mt-10 max-w-lg border-t border-[var(--rule)] pt-7"
			>
				{!session.organizationId && (
					<label className="block text-xs font-medium">
						Organization name
						<Input
							name="name"
							autoComplete="organization"
							required
							minLength={2}
							maxLength={255}
							className="mt-2"
						/>
					</label>
				)}
				<Button type="submit" className="mt-5">
					{session.organizationId ? "Finish organization setup" : "Create organization"}
				</Button>
			</form>
		</main>
	);
}
