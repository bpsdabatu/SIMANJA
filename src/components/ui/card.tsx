import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-slate-200/80 bg-white shadow-card", className)} {...props} />;
}

export function CardHeader({
  title, description, actions, className,
}: { title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "slate" | "teal" | "red" | "amber" | "navy" | "green" | "gold" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    teal: "bg-navy-50 text-navy-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-800",
    navy: "bg-navy-100 text-navy-800",
    green: "bg-emerald-50 text-emerald-700",
    gold: "bg-gold-100 text-gold-700",
  } as const;
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function Alert({
  tone = "red",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "red" | "amber" | "teal" | "green" }) {
  const tones = {
    red: "border-red-200 bg-red-50 text-red-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    teal: "border-navy-100 bg-navy-50 text-navy-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  } as const;
  return <div role="alert" className={cn("rounded-lg border px-3.5 py-2.5 text-sm", tones[tone], className)} {...props} />;
}
