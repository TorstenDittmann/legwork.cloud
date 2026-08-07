import { withAuth } from "@workos-inc/authkit-nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeOnboarding } from "./complete/actions";

export default async function OnboardingPage() {
	const session = await withAuth({ ensureSignedIn: true });
	return (
		<main className="journal-grid flex min-h-screen flex-col items-center justify-center px-6 py-16">
			<div className="w-full max-w-lg">
				<p className="font-display text-lg font-semibold tracking-[-0.01em]">
					OnCall <span className="text-accent">AI</span>
				</p>
				<div className="mt-8 rounded-[4px] border border-rule bg-surface shadow-[0_16px_40px_-16px_rgba(23,26,32,0.16),0_2px_6px_rgba(23,26,32,0.05)]">
					<div className="border-b border-rule px-6 py-3">
						<p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
							Workspace setup · 01
						</p>
					</div>
					<div className="px-6 py-7">
						<h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
							Create Your Workspace
						</h1>
						<p className="mt-3 text-sm leading-6 text-ink-muted">
							Every repository, service, incident, and run is scoped to the active WorkOS
							organization.
						</p>
						<form action={completeOnboarding} className="mt-7">
							{!session.organizationId && (
								<label className="block">
									<span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
										Organization name
									</span>
									<Input name="name" autoComplete="organization" required minLength={2} maxLength={255} />
								</label>
							)}
							<Button type="submit" className="mt-5 w-full">
								{session.organizationId ? "Finish organization setup" : "Create organization"}
							</Button>
						</form>
					</div>
				</div>
			</div>
		</main>
	);
}
