import Link from "next/link";
import { ArrowRight, Check, LockKeyhole, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";

const capabilities = [
	["01", "Exact revisions", "Every investigation is pinned to immutable commit SHAs."],
	["02", "Fail-closed execution", "Approved checks run offline inside a disposable sandbox."],
	["03", "Verifiable evidence", "Every conclusion cites inspected source with exact line ranges."],
	["04", "Explicit limits", "Uncertainty and unavailable checks stay visible in the final record."],
] as const;
const security = [
	[LockKeyhole, "Read-only GitHub App"],
	[TimerReset, "Disposable Railway sandbox"],
	[Check, "30-day incident retention"],
] as const;

export default function LandingPage() {
	return (
		<main className="min-h-screen">
			<nav
				aria-label="Main"
				className="mx-auto flex max-w-[1240px] items-center justify-between border-b border-[var(--rule)] px-5 py-5 sm:px-8"
			>
				<Link href="/" className="font-display text-xl">
					OnCall <i className="font-normal text-[var(--accent)]">AI</i>
				</Link>
				<Button asChild variant="outline" size="sm">
					<Link href="/sign-in">Sign In</Link>
				</Button>
			</nav>
			<section className="journal-grid border-b border-[var(--rule)]">
				<div className="mx-auto grid max-w-[1240px] lg:grid-cols-[1.05fr_.95fr]">
					<div className="px-5 py-20 sm:px-8 sm:py-28 lg:border-r lg:border-[var(--rule)] lg:py-36">
						<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">
							Read-only incident intelligence
						</p>
						<h1 className="mt-6 max-w-3xl font-display text-pretty text-6xl font-medium leading-[.94] tracking-[-.045em] sm:text-7xl xl:text-[92px]">
							A diagnosis your on-call can verify.
						</h1>
						<p className="mt-7 max-w-xl text-base leading-7 text-[var(--ink-muted)] sm:text-lg">
							Inspect exact source snapshots in isolated sandboxes. Return the root cause, the
							evidence, and the limits—without touching production.
						</p>
						<div className="mt-9 flex flex-wrap gap-3">
							<Button asChild size="lg">
								<Link href="/onboarding">
									Get Started <ArrowRight aria-hidden="true" className="size-4" />
								</Link>
							</Button>
							<Button asChild size="lg" variant="ghost">
								<Link href="/sign-in">Open Dashboard</Link>
							</Button>
						</div>
					</div>
					<div className="flex items-center px-5 py-12 sm:px-8 lg:py-24">
						<article className="w-full border border-[var(--rule-strong)] bg-[var(--canvas)]">
							<header className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-3">
								<span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
									Investigation record / 0427
								</span>
								<span className="inline-flex items-center gap-2 font-mono text-[10px] text-[var(--success)]">
									<span className="size-1.5 bg-[var(--success)]" />
									VERIFIED
								</span>
							</header>
							<div className="p-5 sm:p-7">
								<p className="font-mono text-[10px] text-[var(--high)]">HIGH · PAYMENT API</p>
								<h2 className="mt-3 font-display text-3xl leading-tight">
									Concurrent cache eviction interrupts active archive reads
								</h2>
								<p className="mt-5 border-l-2 border-[var(--accent)] pl-4 text-sm leading-6 text-[var(--ink-muted)]">
									The clear path removes the content-addressed store without coordinating with
									active readers.
								</p>
								<div className="mt-7 border-y border-[var(--rule)] py-4 font-mono text-[11px] text-[var(--ink-faint)]">
									<p>internal/cache/layers.go:94–107</p>
									<p className="mt-2 text-[var(--ink-muted)]">
										if err := os.RemoveAll(dir); err != nil &#123;
									</p>
								</div>
								<div className="mt-5 grid grid-cols-2 gap-4 text-[10px]">
									<div>
										<p className="font-mono uppercase text-[var(--ink-faint)]">Revision</p>
										<p className="mt-1 truncate font-mono">0fab160216e8</p>
									</div>
									<div>
										<p className="font-mono uppercase text-[var(--ink-faint)]">Sandbox</p>
										<p className="mt-1 text-[var(--success)]">Destroyed</p>
									</div>
								</div>
							</div>
						</article>
					</div>
				</div>
			</section>
			<section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8">
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
					The operating model
				</p>
				<div className="mt-8 border-t border-[var(--rule)]">
					{capabilities.map(([n, title, copy]) => (
						<div
							key={n}
							className="grid gap-3 border-b border-[var(--rule)] py-6 sm:grid-cols-[60px_220px_1fr]"
						>
							<span className="font-mono text-xs text-[var(--ink-faint)]">{n}</span>
							<h2 className="font-display text-2xl">{title}</h2>
							<p className="max-w-xl text-sm leading-6 text-[var(--ink-muted)]">{copy}</p>
						</div>
					))}
				</div>
			</section>
			<section className="border-y border-[var(--rule)] bg-[var(--surface)]">
				<div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2">
					<div>
						<p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--accent)]">
							Security boundary
						</p>
						<h2 className="mt-4 font-display text-4xl">Evidence in. Nothing out.</h2>
						<p className="mt-4 max-w-lg text-sm leading-6 text-[var(--ink-muted)]">
							Repository commands run with no DNS, HTTP, HTTPS, private-network, or metadata access.
							Sandboxes are temporary; installation credentials remain worker-only.
						</p>
					</div>
					<div className="space-y-4 text-sm">
						{security.map(([Icon, label]) => (
							<div
								key={label}
								className="flex items-center gap-3 border-b border-[var(--rule)] pb-4"
							>
								<Icon aria-hidden="true" className="size-4 text-[var(--accent)]" />
								<span>{label}</span>
							</div>
						))}
					</div>
				</div>
			</section>
			<footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-5 px-5 py-12 sm:px-8">
				<p className="font-display text-3xl">Build a record, not a guess.</p>
				<Button asChild>
					<Link href="/onboarding">
						Get Started <ArrowRight aria-hidden="true" className="size-4" />
					</Link>
				</Button>
			</footer>
		</main>
	);
}
