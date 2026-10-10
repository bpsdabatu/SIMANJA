import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-slate-200 bg-white shadow-card", className)} {...props} />;
}

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "slate" | "teal" | "red" | "amber" | "navy" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    teal: "bg-teal-50 text-teal-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-800",
    navy: "bg-navy-50 text-navy-700",
  } as const;
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function Alert({
  tone = "red",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "red" | "amber" | "teal" }) {
  const tones = {
    red: "border-red-200 bg-red-50 text-red-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    teal: "border-teal-100 bg-teal-50 text-teal-800",
  } as const;
  return <div role="alert" className={cn("rounded-md border px-3 py-2 text-sm", tones[tone], className)} {...props} />;
}
