import Link from "next/link";
import { ArrowRight, Braces, ShieldCheck, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
	{
		Icon: Braces,
		title: "Exact source",
		copy: "Each run records immutable commit SHAs for the primary and related repositories.",
	},
	{
		Icon: ShieldCheck,
		title: "Fail-closed execution",
		copy: "Only typed static tools work until the real no-egress capability probe passes.",
	},
	{
		Icon: TimerReset,
		title: "Disposable by design",
		copy: "Sandboxes are destroyed after every run and incident data expires after 30 days.",
	},
];

export default function LandingPage() {
	return (
		<main>
			<nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
				<span className="font-semibold tracking-tight text-white">
					OnCall<span className="text-cyan-400">AI</span>
				</span>
				<Button asChild variant="outline" size="sm">
					<Link href="/sign-in">Sign in</Link>
				</Button>
			</nav>
			<section className="mx-auto max-w-6xl px-6 pb-24 pt-24">
				<div className="max-w-3xl">
					<p className="mb-5 font-mono text-xs uppercase tracking-[.25em] text-cyan-400">
						Read-only incident intelligence
					</p>
					<h1 className="text-balance text-5xl font-semibold leading-tight tracking-tight text-white md:text-7xl">
						A diagnosis your on-call can verify.
					</h1>
					<p className="mt-7 max-w-2xl text-lg leading-8 text-slate-400">
						OnCall AI inspects approved repositories at exact commits inside disposable sandboxes,
						then returns a root cause with line-level evidence and explicit limitations.
					</p>
					<div className="mt-9 flex gap-3">
						<Button asChild size="lg">
							<Link href="/onboarding">
								Start private beta <ArrowRight className="ml-2 size-4" />
							</Link>
						</Button>
						<Button asChild size="lg" variant="ghost">
							<Link href="/sign-in">Open dashboard</Link>
						</Button>
					</div>
				</div>
				<div className="mt-24 grid gap-4 md:grid-cols-3">
					{features.map(({ Icon, title, copy }) => (
						<Card key={title}>
							<CardContent className="pt-6">
								<Icon className="mb-5 size-5 text-cyan-400" />
								<h2 className="font-medium text-white">{title}</h2>
								<p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p>
							</CardContent>
						</Card>
					))}
				</div>
			</section>
		</main>
	);
}
