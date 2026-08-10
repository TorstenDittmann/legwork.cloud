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

// Supported by Next 16 at runtime, but not yet exposed by its public LinkProps type.
const fullPrefetchOnHover = { unstable_dynamicOnHover: true } as const;

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
			<div className="border-b border-rule px-5 py-5">
				<Link
					href="/dashboard"
					className="font-display text-lg font-semibold tracking-[-0.01em] text-ink"
				>
					OnCall <span className="text-accent">AI</span>
				</Link>
				<p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-faint">
					Incident intelligence
				</p>
			</div>
			{organizations.length > 0 && (
				<form action={changeOrganization} className="border-b border-rule px-4 py-4">
					<label
						htmlFor="organizationId"
						className="mb-2 block font-mono text-[9px] uppercase tracking-[0.08em] text-ink-faint"
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
							{...fullPrefetchOnHover}
							key={href}
							href={href}
							prefetch="auto"
							aria-current={active ? "page" : undefined}
							className={cn(
								"mb-1 flex min-h-10 items-center gap-3 rounded-[3px] border-l-2 px-3 text-sm transition-[color,background-color,border-color]",
								active
									? "border-accent bg-accent/[0.06] font-medium text-ink"
									: "border-transparent text-ink-muted hover:bg-surface-raised hover:text-ink",
							)}
						>
							<Icon aria-hidden="true" className={cn("size-3.5", active && "text-accent")} />
							{label}
						</Link>
					);
				})}
			</nav>
			<div className="border-t border-rule px-4 py-4">
				<p className="truncate font-mono text-[10px] text-ink-faint">{email}</p>
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
			<header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-rule bg-surface px-4 lg:hidden">
				<Link href="/dashboard" className="font-display text-lg font-semibold tracking-[-0.01em]">
					OnCall <span className="text-accent">AI</span>
				</Link>
				<div className="flex items-center gap-3">
					<span className="text-xs text-ink-muted">{current}</span>
					<button
						ref={triggerRef}
						type="button"
						aria-label="Open navigation"
						aria-expanded={open}
						onClick={() => setOpen(true)}
						className="grid size-10 place-items-center rounded-[3px] border border-rule-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					>
						<Menu aria-hidden="true" className="size-4" />
					</button>
				</div>
			</header>
			<aside className="sticky top-0 hidden h-screen flex-col border-r border-rule bg-surface lg:flex">
				{nav}
			</aside>
			{open && (
				<div className="fixed inset-0 z-50 overscroll-contain lg:hidden">
					<button
						type="button"
						aria-label="Close navigation"
						className="absolute inset-0 bg-black/40"
						onClick={() => {
							setOpen(false);
							triggerRef.current?.focus();
						}}
					/>
					<aside
						role="dialog"
						aria-modal="true"
						aria-label="Navigation"
						className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-rule bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_10px_40px_rgba(23,26,32,0.14)]"
					>
						<button
							type="button"
							aria-label="Close navigation"
							onClick={() => {
								setOpen(false);
								triggerRef.current?.focus();
							}}
							className="absolute right-3 top-3 z-10 grid size-10 place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
