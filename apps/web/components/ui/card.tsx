import type * as React from "react";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]",
				className,
			)}
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
			className={cn("font-display text-lg font-semibold tracking-[-0.01em] text-ink", className)}
			{...props}
		/>
	);
}
export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("p-6 pt-3", className)} {...props} />;
}
