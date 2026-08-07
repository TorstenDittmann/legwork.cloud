"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Github, LogOut, Menu, Radio, Settings, Siren, Unplug, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const links = [
	["/incidents", Siren, "Incidents"],
	["/services", Radio, "Services"],
	["/repositories", Github, "Repositories"],
	["/connections", Unplug, "Connections"],
	["/settings", Settings, "Settings"],
] as const;

export function AppNavigation({
	organizations,
	organizationId,
	email,
	changeOrganization,
	logout,
}: {
	organizations: Array<{ id: string; name: string }>;
	organizationId: string;
	email?: string | null;
	changeOrganization(formData: FormData): Promise<void>;
	logout(): Promise<void>;
}) {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	useEffect(() => setOpen(false), [pathname]);
	useEffect(() => {
		if (!open) return;
		const close = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
				triggerRef.current?.focus();
			}
		};
		document.body.style.overflow = "hidden";
		window.addEventListener("keydown", close);
		return () => {
			document.body.style.overflow = "";
			window.removeEventListener("keydown", close);
		};
	}, [open]);
	const current = links.find(([href]) => pathname.startsWith(href))?.[2] ?? "Overview";
	const nav = (
		<>
			<div className="border-b border-[var(--rule)] px-5 py-5">
				<Link
					href="/dashboard"
					className="font-display text-xl tracking-[-0.02em] text-[var(--ink)]"
				>
					OnCall <i className="font-normal text-[var(--accent)]">AI</i>
				</Link>
				<p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
					Incident intelligence
				</p>
			</div>
			{organizations.length > 0 && (
				<form action={changeOrganization} className="border-b border-[var(--rule)] px-4 py-4">
					<label
						htmlFor="organizationId"
						className="mb-2 block font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]"
					>
						Workspace
					</label>
					<Select
						id="organizationId"
						name="organizationId"
						defaultValue={organizationId}
						className="h-9 text-xs"
					>
						{organizations.map(({ id, name }) => (
							<option key={id} value={id}>
								{name}
							</option>
						))}
					</Select>
					<Button type="submit" size="sm" variant="ghost" className="mt-1 w-full">
						Switch Workspace
					</Button>
				</form>
			)}
			<nav aria-label="Primary" className="flex-1 px-3 py-5">
				{links.map(([href, Icon, label]) => {
					const active = pathname.startsWith(href);
					return (
						<Link
							key={href}
							href={href}
							aria-current={active ? "page" : undefined}
							className={cn(
								"mb-1 flex min-h-10 items-center gap-3 border-l-2 px-3 text-sm transition-[color,background-color,border-color]",
								active
									? "border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--ink)]"
									: "border-transparent text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
							)}
						>
							<Icon aria-hidden="true" className="size-3.5" />
							{label}
						</Link>
					);
				})}
			</nav>
			<div className="border-t border-[var(--rule)] px-4 py-4">
				<p className="truncate font-mono text-[10px] text-[var(--ink-faint)]">{email}</p>
				<form action={logout}>
					<Button type="submit" variant="ghost" size="sm" className="mt-2 w-full justify-start">
						<LogOut aria-hidden="true" className="size-3.5" />
						Sign Out
					</Button>
				</form>
			</div>
		</>
	);
	return (
		<>
			<header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--rule)] bg-[var(--canvas)] px-4 lg:hidden">
				<Link href="/dashboard" className="font-display text-lg">
					OnCall <i className="text-[var(--accent)]">AI</i>
				</Link>
				<div className="flex items-center gap-3">
					<span className="text-xs text-[var(--ink-muted)]">{current}</span>
					<button
						ref={triggerRef}
						type="button"
						aria-label="Open navigation"
						aria-expanded={open}
						onClick={() => setOpen(true)}
						className="grid size-10 place-items-center border border-[var(--rule-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
					>
						<Menu aria-hidden="true" className="size-4" />
					</button>
				</div>
			</header>
			<aside className="sticky top-0 hidden h-screen flex-col border-r border-[var(--rule)] bg-[var(--canvas)] lg:flex">
				{nav}
			</aside>
			{open && (
				<div className="fixed inset-0 z-50 overscroll-contain lg:hidden">
					<button
						type="button"
						aria-label="Close navigation"
						className="absolute inset-0 bg-black/70"
						onClick={() => {
							setOpen(false);
							triggerRef.current?.focus();
						}}
					/>
					<aside
						role="dialog"
						aria-modal="true"
						aria-label="Navigation"
						className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col bg-[var(--canvas)] pb-[env(safe-area-inset-bottom)] shadow-2xl"
					>
						<button
							type="button"
							aria-label="Close navigation"
							onClick={() => {
								setOpen(false);
								triggerRef.current?.focus();
							}}
							className="absolute right-3 top-3 z-10 grid size-10 place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
						>
							<X aria-hidden="true" className="size-4" />
						</button>
						{nav}
					</aside>
				</div>
			)}
		</>
	);
}
