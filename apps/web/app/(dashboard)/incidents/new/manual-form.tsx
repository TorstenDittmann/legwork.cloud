"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function ManualIncidentForm({
	services,
}: {
	services: Array<{ id: string; name: string }>;
}) {
	const router = useRouter();
	const [error, setError] = useState("");
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
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
		if (!response.ok) return setError(body.detail ?? "Submission failed");
		router.push(`/incidents/${body.incidentId}`);
	}
	return (
		<form onSubmit={submit} className="max-w-2xl space-y-5">
			<label className="block text-sm">
				Service
				<select
					name="serviceId"
					required
					className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3"
				>
					{services.map((service) => (
						<option key={service.id} value={service.id}>
							{service.name}
						</option>
					))}
				</select>
			</label>
			<label className="block text-sm">
				External ID
				<Input name="externalId" required className="mt-2" />
			</label>
			<label className="block text-sm">
				Title
				<Input name="title" required className="mt-2" />
			</label>
			<label className="block text-sm">
				Severity
				<select
					name="severity"
					defaultValue="unknown"
					className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3"
				>
					{["critical", "high", "medium", "low", "unknown"].map((value) => (
						<option key={value}>{value}</option>
					))}
				</select>
			</label>
			<label className="block text-sm">
				Occurred at
				<Input
					name="occurredAt"
					required
					type="datetime-local"
					defaultValue={new Date().toISOString().slice(0, 16)}
					className="mt-2"
				/>
			</label>
			<label className="block text-sm">
				Environment
				<Input name="environment" className="mt-2" />
			</label>
			<label className="block text-sm">
				Description
				<textarea
					name="description"
					className="mt-2 min-h-28 w-full rounded-md border border-slate-700 bg-slate-950 p-3 text-sm"
				/>
			</label>
			<label className="block text-sm">
				Stack trace
				<textarea
					name="stackTrace"
					className="mt-2 min-h-40 w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs"
				/>
			</label>
			{error && <p className="text-sm text-red-400">{error}</p>}
			<Button type="submit">Queue analysis</Button>
		</form>
	);
}
