"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Data = {
	incident: { id: string; title: string; severity: string; payload: { description?: string } };
	serviceName: string;
	currentRun: {
		id: string;
		status: string;
		failureCode?: string;
		resolvedRevisions?: Array<{ repositoryId: string; sha: string }>;
	} | null;
	steps: Array<{ id: string; summary: string; sequence: number }>;
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
	callbacks: Array<{ id: string; status: string; attempt: number }>;
};
export function IncidentLive({ incidentId }: { incidentId: string }) {
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState("");
	const load = useCallback(async () => {
		const response = await fetch(`/api/incidents/${incidentId}`, { cache: "no-store" });
		if (response.ok) setData(await response.json());
		else setError("Unable to load incident");
	}, [incidentId]);
	useEffect(() => {
		const initialLoad = setTimeout(() => {
			void load();
		}, 0);
		const timer = setInterval(() => {
			void load();
		}, 2000);
		return () => {
			clearTimeout(initialLoad);
			clearInterval(timer);
		};
	}, [load]);
	async function retry() {
		if (!data?.currentRun) return;
		await fetch(`/api/incidents/${incidentId}/retry`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ runId: data.currentRun.id }),
		});
		await load();
	}
	if (error) return <p className="text-red-400">{error}</p>;
	if (!data) return <p className="text-slate-500">Loading incident…</p>;
	const diagnosis = data.diagnosis;
	return (
		<>
			<div className="flex flex-wrap items-center gap-3">
				<h1 className="text-3xl font-semibold text-white">{data.incident.title}</h1>
				<Badge>{data.incident.severity}</Badge>
				<Badge
					className={
						data.currentRun?.status === "completed" ? "border-emerald-800 text-emerald-300" : ""
					}
				>
					{data.currentRun?.status ?? "queued"}
				</Badge>
			</div>
			<p className="mt-3 text-sm text-slate-500">{data.serviceName}</p>
			{data.incident.payload.description && (
				<p className="mt-6 max-w-3xl leading-7 text-slate-300">
					{data.incident.payload.description}
				</p>
			)}
			<div className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
				<div className="space-y-5">
					{diagnosis && (
						<>
							<Card>
								<CardHeader>
									<CardTitle>
										{diagnosis.status === "diagnosed" ? "Diagnosis" : "Inconclusive"}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="leading-7 text-slate-300">{diagnosis.summary}</p>
									{diagnosis.rootCause && (
										<div className="mt-5 border-l-2 border-cyan-400 pl-4">
											<p className="text-white">{diagnosis.rootCause.statement}</p>
											<p className="mt-1 text-xs text-slate-500">
												Confidence {Math.round(diagnosis.rootCause.confidence * 100)}%
											</p>
										</div>
									)}
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle>Evidence</CardTitle>
								</CardHeader>
								<CardContent className="space-y-6">
									{diagnosis.evidence.map((evidence, index) => (
										<div key={index}>
											<p className="font-mono text-xs text-cyan-300">
												{evidence.path
													? `${evidence.path}:${evidence.lineStart}-${evidence.lineEnd}`
													: evidence.command}
											</p>
											<pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-300">
												{evidence.excerpt}
											</pre>
											<p className="mt-2 text-sm text-slate-400">{evidence.explanation}</p>
										</div>
									))}
									{!diagnosis.evidence.length && (
										<p className="text-sm text-slate-500">No evidence passed validation.</p>
									)}
								</CardContent>
							</Card>
							{diagnosis.suggestedFix && (
								<Card>
									<CardHeader>
										<CardTitle>Suggested fix</CardTitle>
									</CardHeader>
									<CardContent>
										<p className="text-sm text-slate-300">{diagnosis.suggestedFix.description}</p>
										<ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-400">
											{diagnosis.suggestedFix.steps.map((step) => (
												<li key={step}>{step}</li>
											))}
										</ol>
										{diagnosis.suggestedFix.patch && (
											<pre className="mt-4 overflow-x-auto rounded bg-slate-950 p-4 text-xs">
												{diagnosis.suggestedFix.patch}
											</pre>
										)}
										<p className="mt-4 text-xs text-amber-300">
											Suggestion only; nothing was applied to GitHub.
										</p>
									</CardContent>
								</Card>
							)}
						</>
					)}
				</div>
				<aside className="space-y-5">
					<Card>
						<CardHeader>
							<CardTitle>Agent activity</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{data.steps.map((step) => (
								<div key={step.id} className="flex gap-3 text-sm">
									<span className="font-mono text-xs text-slate-600">{step.sequence}</span>
									<span className="text-slate-400">{step.summary}</span>
								</div>
							))}
							{!data.steps.length && (
								<p className="text-sm text-slate-500">Waiting for analysis…</p>
							)}
						</CardContent>
					</Card>
					{diagnosis && (
						<Card>
							<CardHeader>
								<CardTitle>Limitations & checks</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3 text-sm text-slate-400">
								{diagnosis.checksRun.map((check) => (
									<p key={check.name}>
										<Badge>{check.status}</Badge>{" "}
										<span className="ml-1">
											{check.name}: {check.summary}
										</span>
									</p>
								))}
								{diagnosis.limitations.map((limitation) => (
									<p key={limitation}>• {limitation}</p>
								))}
								{!diagnosis.limitations.length && !diagnosis.checksRun.length && (
									<p>No reported limitations.</p>
								)}
							</CardContent>
						</Card>
					)}
					<Card>
						<CardHeader>
							<CardTitle>Callback</CardTitle>
						</CardHeader>
						<CardContent>
							{data.callbacks.length ? (
								<p className="text-sm text-slate-400">
									{data.callbacks[0]?.status} · {data.callbacks[0]?.attempt} retries
								</p>
							) : (
								<p className="text-sm text-slate-500">No callback delivery.</p>
							)}
						</CardContent>
					</Card>
					{data.currentRun && ["failed", "inconclusive"].includes(data.currentRun.status) && (
						<Button variant="outline" onClick={retry}>
							Retry analysis
						</Button>
					)}
				</aside>
			</div>
		</>
	);
}
