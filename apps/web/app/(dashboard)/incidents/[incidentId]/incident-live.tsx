"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineAlert, SectionHeader } from "@/components/ui/journal";
import { SeverityMark, StatusMark } from "@/components/ui/status";
import { formatDuration } from "@/lib/utils";

type Data = {
	incident: {
		id: string;
		title: string;
		severity: string;
		occurredAt: string;
		payload: { description?: string; environment?: string };
	};
	serviceName: string;
	currentRun: {
		id: string;
		status: string;
		failureCode?: string;
		resolvedRevisions?: Array<{ repositoryId: string; sha: string }>;
		startedAt?: string;
		completedAt?: string;
	} | null;
	steps: Array<{
		id: string;
		summary: string;
		detail?: string;
		sequence: number;
		kind: string;
		toolName?: string;
		durationMs?: number;
		createdAt: string;
	}>;
	diagnosis: null | {
		status: string;
		summary: string;
		rootCause: null | { statement: string; confidence: number };
		evidence: Array<{
			repositoryId: string;
			path?: string;
			lineStart?: number;
			lineEnd?: number;
			command?: string;
			excerpt: string;
			explanation: string;
		}>;
		suggestedFix: null | { description: string; steps: string[]; patch?: string };
		checksRun: Array<{ name: string; status: string; summary: string }>;
		limitations: string[];
	};
};
export function IncidentLive({ incidentId }: { incidentId: string }) {
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState("");
	const [connected, setConnected] = useState(false);
	const [retrying, setRetrying] = useState(false);
	const [retryError, setRetryError] = useState("");
	const [showJump, setShowJump] = useState(false);
	const transcriptRef = useRef<HTMLDivElement>(null);
	const followTranscript = useRef(true);
	const previousStepCount = useRef(0);
	useEffect(() => {
		const source = new EventSource(`/api/incidents/${incidentId}/events`);
		const receive = (event: MessageEvent<string>) => {
			setData(JSON.parse(event.data) as Data);
			setError("");
			setConnected(true);
		};
		const receiveError = (event: MessageEvent<string>) => {
			const payload = JSON.parse(event.data) as { message?: string };
			setError(payload.message ?? "Unable to load incident");
			source.close();
		};
		source.addEventListener("incident", receive as EventListener);
		source.addEventListener("incident-error", receiveError as EventListener);
		source.onopen = () => setConnected(true);
		source.onerror = () => setConnected(false);
		return () => {
			source.removeEventListener("incident", receive as EventListener);
			source.removeEventListener("incident-error", receiveError as EventListener);
			source.close();
		};
	}, [incidentId]);
	useLayoutEffect(() => {
		const transcript = transcriptRef.current;
		if (!transcript || !data?.steps.length || !followTranscript.current) return;
		transcript.scrollTo({
			top: transcript.scrollHeight,
			behavior:
				previousStepCount.current === 0 ||
				window.matchMedia("(prefers-reduced-motion: reduce)").matches
					? "auto"
					: "smooth",
		});
		previousStepCount.current = data.steps.length;
	}, [data?.steps.length]);
	async function retry() {
		if (!data?.currentRun || retrying) return;
		setRetrying(true);
		setRetryError("");
		try {
			const response = await fetch(`/api/incidents/${incidentId}/retry`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ runId: data.currentRun.id }),
			});
			const payload = (await response.json()) as {
				runId?: string;
				detail?: string;
				title?: string;
			};
			if (!response.ok || !payload.runId)
				throw new Error(payload.detail ?? payload.title ?? "Unable to retry analysis");
			const retryRunId = payload.runId;
			setData((current) =>
				current?.currentRun
					? {
							...current,
							currentRun: { ...current.currentRun, id: retryRunId, status: "queued" },
							steps: [],
							diagnosis: null,
						}
					: current,
			);
			setRetrying(false);
		} catch (retryFailure) {
			setRetryError(
				retryFailure instanceof Error ? retryFailure.message : "Unable to retry analysis",
			);
			setRetrying(false);
		}
	}
	if (error) return <p className="text-danger">{error}</p>;
	if (!data) return <p className="text-[var(--ink-faint)]">Loading Incident…</p>;
	const diagnosis = data.diagnosis;
	const terminal =
		data.currentRun && ["completed", "failed", "inconclusive"].includes(data.currentRun.status);
	const kinds = new Set(data.steps.map(({ kind }) => kind));
	const activeStage = diagnosis
		? 5
		: kinds.has("synthesis")
			? 4
			: data.currentRun?.status === "analyzing"
				? 3
				: kinds.has("sandbox_bootstrap")
					? 2
					: data.currentRun?.status === "provisioning"
						? 1
						: 0;
	const stages = ["Queued", "Provisioning", "Repositories", "Analyzing", "Synthesis", "Complete"];
	const analysisDuration =
		data.currentRun?.startedAt && data.currentRun.completedAt
			? formatDuration(
					new Date(data.currentRun.completedAt).getTime() -
						new Date(data.currentRun.startedAt).getTime(),
				)
			: null;
	return (
		<>
			<header className="border-b border-[var(--rule)] pb-7">
				<a
					href="/incidents"
					className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] hover:text-[var(--accent)]"
				>
					← Incident Ledger
				</a>
				<div className="mt-5 flex flex-wrap items-start justify-between gap-5">
					<div className="min-w-0 max-w-4xl">
						<div className="mb-3 flex flex-wrap items-center gap-4">
							<SeverityMark severity={data.incident.severity} />
							<StatusMark status={data.currentRun?.status ?? "queued"} />
							<span
								aria-live="polite"
								className={`font-mono text-[10px] uppercase tracking-wider ${connected ? "text-[var(--live)]" : "text-[var(--warning)]"}`}
							>
								{connected ? "● Live" : "○ Reconnecting"}
							</span>
						</div>
						<h1 className="font-display text-pretty text-4xl font-medium leading-[1.03] tracking-[-.03em] md:text-6xl">
							{data.incident.title}
						</h1>
					</div>
					{terminal && (
						<Button variant="outline" onClick={retry} disabled={retrying}>
							{retrying ? "Queuing Retry…" : "Retry Analysis"}
						</Button>
					)}
				</div>
				<div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] text-[var(--ink-faint)]">
					<span>{data.serviceName}</span>
					<span>{data.incident.payload.environment ?? "unknown environment"}</span>
					<time>
						{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
							new Date(data.incident.occurredAt),
						)}
					</time>
					{analysisDuration && <span>Analysis duration {analysisDuration}</span>}
					{data.currentRun?.resolvedRevisions?.map(({ repositoryId, sha }) => (
						<span key={repositoryId} translate="no">
							{sha.slice(0, 12)}
						</span>
					))}
				</div>
			</header>
			{retryError && (
				<div className="mt-4">
					<InlineAlert tone="danger">{retryError}</InlineAlert>
				</div>
			)}
			{data.incident.payload.description && (
				<p className="mt-7 max-w-4xl font-display text-xl leading-8 text-[var(--ink-muted)]">
					{data.incident.payload.description}
				</p>
			)}
			{!diagnosis && (
				<section className="mt-9">
					<SectionHeader meta={`Stage ${activeStage + 1} / ${stages.length}`}>
						Run Progress
					</SectionHeader>
					<ol className="grid grid-cols-2 border-y border-[var(--rule)] sm:grid-cols-3 lg:grid-cols-6">
						{stages.map((stage, index) => (
							<li
								key={stage}
								className={`border-[var(--rule)] px-3 py-4 sm:border-r ${index <= activeStage ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}`}
							>
								<span
									aria-hidden="true"
									className={`mb-2 block h-0.5 ${index <= activeStage ? "bg-[var(--accent)]" : "bg-[var(--rule)]"}`}
								/>
								<span className="font-mono text-[9px] uppercase tracking-wider">{stage}</span>
							</li>
						))}
					</ol>
				</section>
			)}
			<div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-5">
					{diagnosis && (
						<>
							<Card className="border-x-0 border-t-2 border-t-[var(--accent)]">
								<CardHeader>
									<CardTitle className="text-3xl">
										{diagnosis.status === "diagnosed" ? "Diagnosis" : "Inconclusive"}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="font-display text-xl leading-8 text-[var(--ink-muted)]">
										{diagnosis.summary}
									</p>
									{diagnosis.rootCause && (
										<div className="mt-6 border-l-2 border-[var(--accent)] pl-5">
											<p className="text-lg leading-7 text-[var(--ink)]">
												{diagnosis.rootCause.statement}
											</p>
											<p className="mt-2 font-mono text-[10px] text-[var(--ink-faint)]">
												Confidence {Math.round(diagnosis.rootCause.confidence * 100)}%
											</p>
										</div>
									)}
								</CardContent>
							</Card>
							<Card className="border-x-0">
								<CardHeader>
									<CardTitle>Evidence</CardTitle>
								</CardHeader>
								<CardContent className="space-y-6">
									{diagnosis.evidence.map((evidence, index) => (
										<article
											key={index}
											className="border-t border-[var(--rule)] pt-5 first:border-0 first:pt-0"
										>
											<p className="font-mono text-[10px] text-[var(--accent)]">
												[{String(index + 1).padStart(2, "0")}]{" "}
												{evidence.path
													? `${evidence.path}:${evidence.lineStart}-${evidence.lineEnd}`
													: evidence.command}
											</p>
											<pre
												translate="no"
												className="mt-3 overflow-x-auto border border-[var(--rule)] bg-[var(--canvas)] p-4 text-xs leading-5 text-[var(--ink-muted)]"
											>
												{evidence.excerpt}
											</pre>
											<p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">
												{evidence.explanation}
											</p>
										</article>
									))}
									{!diagnosis.evidence.length && (
										<p className="text-sm text-[var(--ink-faint)]">
											No evidence passed validation.
										</p>
									)}
								</CardContent>
							</Card>
							{diagnosis.suggestedFix && (
								<Card>
									<CardHeader>
										<CardTitle>Suggested fix</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="text-sm text-[var(--ink)]">
											{diagnosis.suggestedFix.description}
										</p>
										<ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
											{diagnosis.suggestedFix.steps.map((step) => (
												<li key={step}>{step}</li>
											))}
										</ol>
										{diagnosis.suggestedFix.patch && (
											<pre className="mt-4 overflow-x-auto border border-[var(--rule)] bg-[var(--canvas)] p-4 text-xs">
												{diagnosis.suggestedFix.patch}
											</pre>
										)}
										<p className="mt-4 text-xs text-warning">
											Suggestion only; nothing was applied to GitHub.
										</p>
									</CardContent>
								</Card>
							)}
						</>
					)}
				</div>
				<aside className="space-y-5">
					{diagnosis && (
						<Card>
							<CardHeader>
								<CardTitle>Limitations & checks</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3 text-sm text-[var(--ink-muted)]">
								{diagnosis.checksRun.map((check, index) => (
									<p key={`${check.name}-${index}`}>
										<Badge>{check.status}</Badge>{" "}
										<span className="ml-1">
											{check.name}: {check.summary}
										</span>
									</p>
								))}
								{diagnosis.limitations.map((limitation, index) => (
									<p key={`${limitation}-${index}`}>• {limitation}</p>
								))}
								{!diagnosis.limitations.length && !diagnosis.checksRun.length && (
									<p>No reported limitations.</p>
								)}
							</CardContent>
						</Card>
					)}
				</aside>
			</div>
			<section className="mt-10" aria-labelledby="agent-activity-heading">
				<div className="mb-3 flex flex-wrap items-end justify-between gap-2">
					<div>
						<h2 id="agent-activity-heading" className="font-display text-2xl font-medium">
							Investigation Record
						</h2>
						<p className="mt-0.5 text-xs text-[var(--ink-faint)]">
							Sandbox lifecycle, prompts, model responses, tool calls, and tool output ·
							chronological
						</p>
					</div>
					<div className="flex items-center gap-3">
						{showJump && (
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									const el = transcriptRef.current;
									if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
									followTranscript.current = true;
									setShowJump(false);
								}}
							>
								Jump to Latest
							</Button>
						)}
						<span
							aria-live="polite"
							className={
								connected
									? "font-mono text-[10px] text-[var(--live)]"
									: "font-mono text-[10px] text-[var(--warning)]"
							}
						>
							{data.steps.length} events · {connected ? "live" : "reconnecting"}
						</span>
					</div>
				</div>
				<div
					ref={transcriptRef}
					onScroll={(event) => {
						const element = event.currentTarget;
						followTranscript.current =
							element.scrollHeight - element.scrollTop - element.clientHeight < 80;
						setShowJump(!followTranscript.current);
					}}
					className="h-[38rem] overflow-y-auto overscroll-contain border border-[var(--rule)] bg-[var(--surface)] px-3 scroll-smooth"
				>
					{data.steps.map((step) => (
						<div
							key={step.id}
							className="agent-log-entry grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2 border-b border-[var(--rule)] py-3 last:border-0 md:grid-cols-[2rem_8rem_minmax(0,1fr)_auto]"
						>
							<span className="pt-0.5 text-right font-mono text-[10px] text-[var(--ink-faint)]">
								{step.sequence}
							</span>
							<div className="flex min-w-0 items-center gap-1.5 pt-0.5">
								<span className="truncate font-mono text-[10px] uppercase tracking-wide text-[var(--accent)]">
									{step.kind.replaceAll("_", " ")}
								</span>
							</div>
							<div className="min-w-0">
								<p className="text-sm leading-5 text-[var(--ink-muted)]">{step.summary}</p>
								{step.detail && (
									<details className="group mt-1">
										<summary className="cursor-pointer list-none font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink-muted)]">
											<span className="group-open:hidden">▸ show payload</span>
											<span className="hidden group-open:inline">▾ hide payload</span>
											<span className="ml-2 opacity-60">{step.detail.length} chars</span>
										</summary>
										<pre className="mt-2 whitespace-pre-wrap break-words border-l border-[var(--rule-strong)] pl-3 font-mono text-xs leading-5 text-[var(--ink-muted)]">
											{step.detail}
										</pre>
									</details>
								)}
							</div>
							<div className="col-start-2 flex items-center gap-2 pt-0.5 font-mono text-[10px] text-[var(--ink-faint)] md:col-start-auto">
								{step.toolName && <span>{step.toolName}</span>}
								{step.durationMs !== undefined && <span>{step.durationMs}ms</span>}
								<span>{new Date(step.createdAt).toLocaleTimeString()}</span>
							</div>
						</div>
					))}
					{!data.steps.length && (
						<p className="py-6 text-sm text-[var(--ink-faint)]">Waiting for analysis…</p>
					)}
				</div>
			</section>
		</>
	);
}
