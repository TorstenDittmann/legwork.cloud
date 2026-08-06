"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RepositoryOption {
	id: string;
	fullName: string;
}
interface Mapping {
	repositoryId: string;
	role: "primary" | "related";
}

export function ServiceEditor({
	serviceId,
	name,
	callbackUrl,
	enabled,
	repositories,
	mappings,
}: {
	serviceId: string;
	name: string;
	callbackUrl: string | null;
	enabled: boolean;
	repositories: RepositoryOption[];
	mappings: Mapping[];
}) {
	const router = useRouter();
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [revealedKey, setRevealedKey] = useState<string | null>(null);
	const primary = mappings.find((mapping) => mapping.role === "primary")?.repositoryId;
	const related = new Set(
		mappings.filter((mapping) => mapping.role === "related").map((mapping) => mapping.repositoryId),
	);

	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setMessage("");
		setError("");
		const form = new FormData(event.currentTarget);
		const response = await fetch(`/api/services/${serviceId}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: form.get("name"),
				primaryRepositoryId: form.get("primaryRepositoryId"),
				relatedRepositoryIds: form.getAll("relatedRepositoryIds").filter(Boolean),
				callbackUrl: form.get("callbackUrl") || null,
				enabled: form.get("enabled") === "on",
			}),
		});
		const body = await response.json();
		if (!response.ok) {
			setError(body.detail ?? "Unable to update service");
			return;
		}
		setMessage("Service updated.");
		router.refresh();
	}

	async function rotateKey() {
		setMessage("");
		setError("");
		setRevealedKey(null);
		const response = await fetch(`/api/services/${serviceId}/rotate-key`, { method: "POST" });
		const body = await response.json();
		if (!response.ok) {
			setError(body.detail ?? "Unable to rotate key");
			return;
		}
		setRevealedKey(body.ingestionKey);
		router.refresh();
	}

	return (
		<div className="space-y-8">
			<form onSubmit={save} className="space-y-5">
				<label className="block text-sm">
					Name
					<Input name="name" required defaultValue={name} className="mt-2" />
				</label>
				<label className="block text-sm">
					Primary repository
					<select
						name="primaryRepositoryId"
						required
						defaultValue={primary}
						className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3"
					>
						{repositories.map((repository) => (
							<option key={repository.id} value={repository.id}>
								{repository.fullName}
							</option>
						))}
					</select>
				</label>
				<label className="block text-sm">
					Related repositories (up to two)
					<select
						name="relatedRepositoryIds"
						multiple
						size={Math.min(5, repositories.length)}
						defaultValue={[...related]}
						className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 p-3"
					>
						{repositories.map((repository) => (
							<option key={repository.id} value={repository.id}>
								{repository.fullName}
							</option>
						))}
					</select>
				</label>
				<label className="block text-sm">
					Callback HTTPS URL
					<Input name="callbackUrl" type="url" defaultValue={callbackUrl ?? ""} className="mt-2" />
				</label>
				<label className="flex items-center gap-3 text-sm">
					<input
						name="enabled"
						type="checkbox"
						defaultChecked={enabled}
						className="size-4 accent-cyan-400"
					/>
					Accept new incidents
				</label>
				{message && <p className="text-sm text-emerald-400">{message}</p>}
				{error && <p className="text-sm text-red-400">{error}</p>}
				<Button type="submit">Save service</Button>
			</form>
			<div className="border-t border-slate-800 pt-6">
				<p className="text-sm text-slate-400">
					Rotating immediately revokes the current ingestion key.
				</p>
				<Button type="button" variant="outline" className="mt-3" onClick={rotateKey}>
					Rotate ingestion key
				</Button>
				{revealedKey && (
					<div className="mt-4 rounded border border-amber-800 bg-amber-950/20 p-4">
						<p className="text-sm text-amber-200">Copy this key now. It will not be shown again.</p>
						<code className="mt-2 block overflow-x-auto text-xs text-slate-200">{revealedKey}</code>
					</div>
				)}
			</div>
		</div>
	);
}
