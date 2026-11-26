import * as React from "react";
import { cn } from "./utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "amber";
  size?: "sm" | "md" | "lg";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-teal-700 text-white hover:bg-teal-800 active:bg-teal-900 shadow-sm",
  amber:
    "bg-amber-500 text-slate-950 hover:bg-amber-400 active:bg-amber-600 font-semibold shadow-sm",
  secondary:
    "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950",
  outline:
    "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-xs rounded-lg",
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-14 px-6 text-base rounded-2xl",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "teal" | "amber" | "slate" | "emerald" | "rose";
}

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  teal: "bg-teal-50 text-teal-800 border-teal-200",
  amber: "bg-amber-50 text-amber-900 border-amber-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rose: "bg-rose-50 text-rose-800 border-rose-200",
};

export function Badge({
  className,
  tone = "teal",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function BrandLogo({
  subtitle,
  dark = false,
}: {
  subtitle?: string;
  dark?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-700 to-emerald-600 text-white font-black tracking-tight shadow-sm">
        G.
      </div>
      <div className="leading-tight">
        <div
          className={cn(
            "text-lg font-extrabold tracking-tight",
            dark ? "text-white" : "text-slate-900"
          )}
        >
          Go<span className="text-amber-500">.boda</span>
        </div>
        {subtitle ? (
          <div
            className={cn(
              "text-[11px] font-medium",
              dark ? "text-slate-300" : "text-slate-500"
            )}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
