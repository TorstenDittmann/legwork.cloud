"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, GitBranch, LoaderCircle, Search, Unplug, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface RepositoryItem {
	id: string;
	fullName: string;
	defaultBranch: string;
	selected: boolean;
	archived: boolean;
	removedAt: string | null;
}

const queryKey = ["repositories"] as const;

async function fetchRepositories(): Promise<RepositoryItem[]> {
	const response = await fetch("/api/repositories", { headers: { accept: "application/json" } });
	if (!response.ok) throw new Error("Could not load repositories");
	return response.json() as Promise<RepositoryItem[]>;
}

async function updateRepository(id: string, selected: boolean): Promise<RepositoryItem> {
	const response = await fetch(`/api/repositories/${id}`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ selected }),
	});
	if (!response.ok) throw new Error("Could not update repository");
	const row = (await response.json()) as RepositoryItem & { removedAt: string | null };
	return { ...row, removedAt: row.removedAt ? new Date(row.removedAt).toISOString() : null };
}

export function RepositoryList({
	initialRepositories,
	canManage,
}: {
	initialRepositories: RepositoryItem[];
	canManage: boolean;
}) {
	const client = useQueryClient();
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(search.trim().toLowerCase());
	const {
		data = [],
		isFetching,
		isError,
	} = useQuery({
		queryKey,
		queryFn: fetchRepositories,
		initialData: initialRepositories,
	});
	const mutation = useMutation({
		mutationFn: ({ id, selected }: { id: string; selected: boolean }) =>
			updateRepository(id, selected),
		onMutate: async ({ id, selected }) => {
			await client.cancelQueries({ queryKey });
			const previous = client.getQueryData<RepositoryItem[]>(queryKey);
			client.setQueryData<RepositoryItem[]>(queryKey, (current = []) =>
				current.map((repository) =>
					repository.id === id ? { ...repository, selected } : repository,
				),
			);
			return { previous };
		},
		onError: (_error, _variables, context) => {
			if (context?.previous) client.setQueryData(queryKey, context.previous);
		},
		onSettled: () => client.invalidateQueries({ queryKey }),
	});
	const filtered = useMemo(
		() =>
			deferredSearch
				? data.filter((repository) =>
						`${repository.fullName} ${repository.defaultBranch}`
							.toLowerCase()
							.includes(deferredSearch),
					)
				: data,
		[data, deferredSearch],
	);
	const included = data.filter((repository) => repository.selected && !repository.removedAt).length;

	return (
		<section className="mt-7" aria-labelledby="repository-inventory-title">
			<div className="flex flex-col gap-3 border-b border-rule pb-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h2 id="repository-inventory-title" className="font-display text-lg font-semibold">
							Repository inventory
						</h2>
						{isFetching && (
							<LoaderCircle
								className="size-3.5 animate-spin text-ink-faint"
								aria-label="Refreshing"
							/>
						)}
					</div>
					<p className="mt-1 text-xs text-ink-faint">
						{included} included · {data.length} synchronized
					</p>
				</div>
				<label className="relative block w-full sm:w-72">
					<span className="sr-only">Search repositories</span>
					<Search
						className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-faint"
						aria-hidden="true"
					/>
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search repositories…"
						className="h-9 pl-9 pr-9"
					/>
					{search && (
						<button
							type="button"
							onClick={() => setSearch("")}
							aria-label="Clear search"
							className="absolute top-2.5 right-3 text-ink-faint hover:text-ink"
						>
							<X className="size-4" />
						</button>
					)}
				</label>
			</div>

			{mutation.isError && (
				<p className="mt-3 text-xs text-danger" role="alert">
					Unable to update the repository. Your previous selection was restored.
				</p>
			)}
			{isError && (
				<p className="mt-3 text-xs text-danger" role="alert">
					Repository refresh failed. Showing the last available data.
				</p>
			)}

			<div className="mt-3 overflow-hidden rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]">
				<div className="hidden grid-cols-[minmax(0,1fr)_180px_110px_104px] gap-4 border-b border-rule bg-surface-raised/60 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint md:grid">
					<span>Repository</span>
					<span>Default branch</span>
					<span>Status</span>
					<span className="text-right">Access</span>
				</div>
				{filtered.length ? (
					filtered.map((repository) => {
						const unavailable = Boolean(repository.removedAt);
						const pending = mutation.isPending && mutation.variables?.id === repository.id;
						return (
							<div
								key={repository.id}
								className="grid min-h-12 items-center gap-2 border-b border-rule px-4 py-2.5 last:border-0 md:grid-cols-[minmax(0,1fr)_180px_110px_104px] md:gap-4"
							>
								<div className="min-w-0">
									<p translate="no" className="truncate text-sm font-medium text-ink">
										{repository.fullName}
									</p>
								</div>
								<div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-ink-faint">
									<GitBranch className="size-3 shrink-0" aria-hidden="true" />
									<span className="truncate">{repository.defaultBranch}</span>
								</div>
								<div>
									{unavailable ? (
										<Badge tone="danger">
											<Unplug className="size-2.5" />
											Removed
										</Badge>
									) : repository.archived ? (
										<Badge tone="warning">
											<Archive className="size-2.5" />
											Archived
										</Badge>
									) : (
										<Badge tone="success">Active</Badge>
									)}
								</div>
								<div className="flex justify-end">
									{canManage && !unavailable ? (
										<Button
											size="sm"
											variant={repository.selected ? "ghost" : "outline"}
											className={repository.selected ? "text-success hover:text-success" : ""}
											disabled={pending}
											onClick={() =>
												mutation.mutate({ id: repository.id, selected: !repository.selected })
											}
										>
											{pending ? (
												<LoaderCircle className="size-3.5 animate-spin" />
											) : repository.selected ? (
												<>
													<Check className="size-3.5" />
													Included
												</>
											) : (
												"Include"
											)}
										</Button>
									) : (
										<span className="text-xs text-ink-faint">
											{repository.selected ? "Included" : "Excluded"}
										</span>
									)}
								</div>
							</div>
						);
					})
				) : (
					<div className="px-4 py-10 text-center">
						<p className="text-sm font-medium">No repositories found</p>
						<p className="mt-1 text-xs text-ink-faint">
							Try a different repository or branch name.
						</p>
					</div>
				)}
			</div>
		</section>
	);
}
