import Link from "next/link";
import { ArrowRight, Check, LockKeyhole, TimerReset } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
			<nav aria-label="Main" className="border-b border-rule bg-surface">
				<div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8">
					<Link href="/" className="font-display text-lg font-semibold tracking-[-0.01em]">
						OnCall <span className="text-accent">AI</span>
					</Link>
					<Button asChild variant="outline" size="sm">
						<Link href="/sign-in">Sign In</Link>
					</Button>
				</div>
			</nav>
			<section className="journal-grid border-b border-rule">
				<div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
					<div>
						<Badge tone="live">
							<span aria-hidden="true" className="size-1 bg-current" />
							Read-only incident intelligence
						</Badge>
						<h1 className="mt-6 max-w-3xl font-display text-pretty text-5xl font-semibold leading-[0.98] tracking-[-0.03em] text-ink sm:text-6xl xl:text-[80px]">
							A diagnosis your on-call can verify.
						</h1>
						<p className="mt-6 max-w-xl text-base leading-7 text-ink-muted sm:text-lg">
							Inspect exact source snapshots in isolated sandboxes. Return the root cause, the
							evidence, and the limits—without touching production.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
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
					<article className="w-full rounded-[4px] border border-rule bg-surface shadow-[0_16px_40px_-16px_rgba(23,26,32,0.2),0_2px_6px_rgba(23,26,32,0.05)]">
						<header className="flex items-center justify-between border-b border-rule px-4 py-3">
							<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
								Investigation record / 0427
							</span>
							<Badge tone="success">
								<span aria-hidden="true" className="size-1 bg-current" />
								Verified
							</Badge>
						</header>
						<div className="p-5 sm:p-7">
							<p className="font-mono text-[10px] uppercase tracking-[0.08em] text-high">
								High · Payment API
							</p>
							<h2 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-[-0.01em]">
								Concurrent cache eviction interrupts active archive reads
							</h2>
							<p className="mt-4 border-l-2 border-accent pl-4 text-sm leading-6 text-ink-muted">
								The clear path removes the content-addressed store without coordinating with
								active readers.
							</p>
							<div className="mt-6 overflow-hidden rounded-[3px] border border-rule">
								<p className="border-b border-rule bg-surface px-3 py-2 font-mono text-[10px] text-accent">
									E-01 · internal/cache/layers.go:94–107
								</p>
								<pre
									translate="no"
									className="bg-surface-raised px-3 py-2.5 font-mono text-[11px] leading-5 text-ink-muted"
								>
									if err := os.RemoveAll(dir); err != nil &#123;
								</pre>
							</div>
							<dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-rule bg-rule">
								<div className="bg-surface px-3 py-2.5">
									<dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">
										Revision
									</dt>
									<dd className="mt-1 truncate font-mono text-xs text-ink" translate="no">
										0fab160216e8
									</dd>
								</div>
								<div className="bg-surface px-3 py-2.5">
									<dt className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint">
										Sandbox
									</dt>
									<dd className="mt-1 font-mono text-xs text-success">Destroyed</dd>
								</div>
							</dl>
						</div>
					</article>
				</div>
			</section>
			<section className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 sm:py-20">
				<div className="flex flex-wrap items-baseline justify-between gap-4">
					<h2 className="font-display text-2xl font-semibold tracking-[-0.01em]">
						The operating model
					</h2>
					<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
						Four-step pipeline
					</span>
				</div>
				<ol className="mt-6 grid gap-px overflow-hidden rounded-[4px] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
					{capabilities.map(([n, title, copy]) => (
						<li key={n} className="bg-surface p-5">
							<span className="font-mono text-[10px] text-accent">{n}</span>
							<h3 className="mt-3 font-display text-lg font-semibold tracking-[-0.01em]">{title}</h3>
							<p className="mt-2 text-sm leading-6 text-ink-muted">{copy}</p>
						</li>
					))}
				</ol>
			</section>
			<section className="border-y border-rule bg-surface">
				<div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2">
					<div>
						<h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">
							Evidence in. Nothing out.
						</h2>
						<p className="mt-4 max-w-lg text-sm leading-6 text-ink-muted">
							Repository commands run with no DNS, HTTP, HTTPS, private-network, or metadata access.
							Sandboxes are temporary; installation credentials remain worker-only.
						</p>
					</div>
					<ul className="divide-y divide-rule self-start rounded-[4px] border border-rule">
						{security.map(([Icon, label]) => (
							<li key={label} className="flex items-center gap-3 px-4 py-4 text-sm">
								<Icon aria-hidden="true" className="size-4 text-accent" />
								{label}
							</li>
						))}
					</ul>
				</div>
			</section>
			<footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-5 px-5 py-12 sm:px-8">
				<p className="font-display text-2xl font-semibold tracking-[-0.01em]">
					Build a record, not a guess.
				</p>
				<Button asChild>
					<Link href="/onboarding">
						Get Started <ArrowRight aria-hidden="true" className="size-4" />
					</Link>
				</Button>
			</footer>
		</main>
	);
}
