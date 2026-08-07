import type * as React from "react";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("rounded-[4px] border border-[var(--rule)] bg-[var(--surface)]", className)}
			{...props}
		/>
	);
}
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("p-6 pb-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
	return (
		<h3
			className={cn("font-display text-xl font-medium text-[var(--ink)]", className)}
			{...props}
		/>
	);
}
export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("p-6 pt-3", className)} {...props} />;
}
