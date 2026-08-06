import type * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) { return <input className={cn("h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400", className)} {...props} />; }
