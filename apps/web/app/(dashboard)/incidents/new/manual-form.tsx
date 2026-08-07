"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, Textarea } from "@/components/ui/form";
import { InlineAlert, SectionHeader } from "@/components/ui/journal";
export function ManualIncidentForm({
	services,
}: {
	services: Array<{ id: string; name: string }>;
}) {
	const router = useRouter();
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError("");
		const form = new FormData(event.currentTarget);
		const response = await fetch("/api/incidents/manual", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				serviceId: form.get("serviceId"),
				externalId: form.get("externalId"),
				title: form.get("title"),
				description: form.get("description") || undefined,
				severity: form.get("severity"),
				occurredAt: new Date(String(form.get("occurredAt"))).toISOString(),
				environment: form.get("environment") || undefined,
				stackTrace: form.get("stackTrace") || undefined,
			}),
		});
		const body = await response.json();
		if (!response.ok) {
			setError(body.detail ?? "Submission failed. Check the incident details and try again.");
			setPending(false);
			return;
		}
		router.push(`/incidents/${body.incidentId}`);
	}
	return (
		<form onSubmit={submit} className="max-w-4xl space-y-10">
			<section>
				<SectionHeader meta="Required">Incident Identity</SectionHeader>
				<div className="grid gap-5 sm:grid-cols-2">
					<Field label="Service" htmlFor="serviceId">
						<Select id="serviceId" name="serviceId" required>
							{services.map((service) => (
								<option key={service.id} value={service.id}>
									{service.name}
								</option>
							))}
						</Select>
					</Field>
					<Field
						label="External ID"
						htmlFor="externalId"
						hint="Your alert, ticket, or deployment identifier."
					>
						<Input
							id="externalId"
							name="externalId"
							autoComplete="off"
							spellCheck={false}
							required
							placeholder="alert-prod-1042…"
						/>
					</Field>
					<Field label="Title" htmlFor="title" className="sm:col-span-2">
						<Input
							id="title"
							name="title"
							autoComplete="off"
							required
							placeholder="Describe the observable failure…"
						/>
					</Field>
					<Field label="Severity" htmlFor="severity">
						<Select id="severity" name="severity" defaultValue="unknown">
							{["critical", "high", "medium", "low", "unknown"].map((value) => (
								<option key={value}>{value}</option>
							))}
						</Select>
					</Field>
					<Field label="Occurred At" htmlFor="occurredAt">
						<Input
							id="occurredAt"
							name="occurredAt"
							required
							type="datetime-local"
							defaultValue={new Date().toISOString().slice(0, 16)}
						/>
					</Field>
					<Field label="Environment" htmlFor="environment">
						<Input
							id="environment"
							name="environment"
							autoComplete="off"
							placeholder="production / eu-west-1…"
						/>
					</Field>
				</div>
			</section>
			<section>
				<SectionHeader meta="Diagnostic context">Failure Signal</SectionHeader>
				<div className="space-y-5">
					<Field
						label="Description"
						htmlFor="description"
						hint="Include expected behavior, what changed, and the observed impact."
					>
						<Textarea
							id="description"
							name="description"
							placeholder="The deploy began failing after…"
						/>
					</Field>
					<Field label="Stack Trace" htmlFor="stackTrace">
						<Textarea
							id="stackTrace"
							name="stackTrace"
							spellCheck={false}
							className="min-h-48 font-mono text-xs"
							placeholder="Paste the complete stack trace…"
						/>
					</Field>
				</div>
			</section>
			{error && <InlineAlert tone="danger">{error}</InlineAlert>}
			<Button type="submit" disabled={pending}>
				{pending ? "Queuing Analysis…" : "Queue Analysis"}
			</Button>
		</form>
	);
}
