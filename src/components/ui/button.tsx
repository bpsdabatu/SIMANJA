import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 h-10 px-4",
  {
    variants: {
      variant: {
        primary: "bg-navy-800 text-white hover:bg-navy-700",
        accent: "bg-teal-600 text-white hover:bg-teal-700",
        outline: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
        ghost: "text-slate-700 hover:bg-slate-100",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant }), className)} {...props} />
  ),
);
Button.displayName = "Button";
