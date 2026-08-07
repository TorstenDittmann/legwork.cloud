"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/journal";

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
	const [pending, setPending] = useState<"save" | "rotate" | null>(null);
	const [dirty, setDirty] = useState(false);
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (dirty) event.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);
	const primary = mappings.find((mapping) => mapping.role === "primary")?.repositoryId;
	const related = new Set(
		mappings.filter((mapping) => mapping.role === "related").map((mapping) => mapping.repositoryId),
	);

	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setMessage("");
		setError("");
		setPending("save");
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
			setPending(null);
			return;
		}
		setMessage("Service updated.");
		setDirty(false);
		setPending(null);
		router.refresh();
	}

	async function rotateKey() {
		if (
			!window.confirm("Rotate this ingestion key? The current key will stop working immediately.")
		)
			return;
		setMessage("");
		setError("");
		setRevealedKey(null);
		setPending("rotate");
		const response = await fetch(`/api/services/${serviceId}/rotate-key`, { method: "POST" });
		const body = await response.json();
		if (!response.ok) {
			setError(body.detail ?? "Unable to rotate key");
			setPending(null);
			return;
		}
		setRevealedKey(body.ingestionKey);
		setPending(null);
		router.refresh();
	}

	return (
		<div className="space-y-8">
			<form onSubmit={save} onChange={() => setDirty(true)} className="space-y-5">
				<Field label="Name" htmlFor="service-name">
					<Input id="service-name" name="name" autoComplete="off" required defaultValue={name} />
				</Field>
				<Field label="Primary Repository" htmlFor="primary-repository">
					<Select
						id="primary-repository"
						name="primaryRepositoryId"
						required
						defaultValue={primary}
					>
						{repositories.map((repository) => (
							<option key={repository.id} value={repository.id}>
								{repository.fullName}
							</option>
						))}
					</Select>
				</Field>
				<fieldset>
					<legend className="text-xs font-medium">
						Related Repositories <span className="text-ink-faint">(up to 2)</span>
					</legend>
					<div className="mt-2 grid gap-px border border-rule bg-rule">
						{repositories.map((repository) => (
							<label
								key={repository.id}
								className="flex min-h-10 items-center gap-3 bg-canvas px-3 text-sm"
							>
								<input
									type="checkbox"
									name="relatedRepositoryIds"
									value={repository.id}
									defaultChecked={related.has(repository.id)}
									className="size-4 accent-accent"
								/>
								<span translate="no" className="min-w-0 truncate">
									{repository.fullName}
								</span>
							</label>
						))}
					</div>
				</fieldset>
				<Field label="Callback HTTPS URL" htmlFor="callback-url">
					<Input
						id="callback-url"
						name="callbackUrl"
						type="url"
						autoComplete="url"
						defaultValue={callbackUrl ?? ""}
					/>
				</Field>
				<label className="flex items-center gap-3 text-sm">
					<input
						name="enabled"
						type="checkbox"
						defaultChecked={enabled}
						className="size-4 accent-accent"
					/>
					Accept new incidents
				</label>
				{message && <InlineAlert tone="success">{message}</InlineAlert>}
				{error && <InlineAlert tone="danger">{error}</InlineAlert>}
				<Button type="submit" disabled={pending !== null}>
					{pending === "save" ? "Saving Service…" : "Save Service"}
				</Button>
			</form>
			<div className="border-t border-rule pt-6">
				<p className="text-sm text-ink-muted">
					Rotating immediately revokes the current ingestion key.
				</p>
				<Button
					type="button"
					variant="outline"
					className="mt-3"
					onClick={rotateKey}
					disabled={pending !== null}
				>
					{pending === "rotate" ? "Rotating Key…" : "Rotate Ingestion Key"}
				</Button>
				{revealedKey && (
					<div className="mt-4 border-l-2 border-warning bg-surface-raised p-4">
						<p className="text-sm text-warning">
							Copy this key now. It will not be shown again.
						</p>
						<code translate="no" className="mt-2 block overflow-x-auto text-xs text-ink">
							{revealedKey}
						</code>
					</div>
				)}
			</div>
		</div>
	);
}
