import * as React from "react";
import { cn } from "./utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "amber";
  size?: "sm" | "md" | "lg";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[#17645F] text-[#F3EEE8] hover:bg-[#114E4A] active:bg-[#0D3D3A] shadow-sm",
  amber:
    "bg-[#B86B2B] text-[#FAF7F2] hover:bg-[#9E5921] active:bg-[#844818] font-semibold shadow-sm",
  secondary:
    "bg-[#0F3F3C] text-[#F3EEE8] hover:bg-[#17645F] active:bg-[#0B2E2C]",
  outline:
    "border border-[#17645F]/45 bg-[#FAF7F2]/80 text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]",
  ghost: "text-[#17645F] hover:bg-[#17645F]/10",
  danger: "bg-[#A93232] text-[#FAF7F2] hover:bg-[#8E2626] active:bg-[#761E1E]",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3.5 text-xs rounded-full",
  md: "h-11 px-5 text-sm rounded-full",
  lg: "h-13 px-6 py-3 text-sm rounded-full tracking-wide",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17645F] disabled:pointer-events-none disabled:opacity-50",
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
  teal: "bg-[#E4EFEA] text-[#17645F] border-[#17645F]/25",
  amber: "bg-[#F4E7D7] text-[#8E4F1D] border-[#B86B2B]/30",
  slate: "bg-[#EAE3D9] text-[#3F4F4D] border-[#17645F]/15",
  emerald: "bg-[#DFEFEA] text-[#14584C] border-[#17645F]/25",
  rose: "bg-[#F7E4E4] text-[#9A2929] border-[#A93232]/25",
};

export function Badge({
  className,
  tone = "teal",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
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
        "rounded-2xl border border-[#17645F]/15 bg-[#FAF7F2] shadow-[0_2px_12px_rgba(23,100,95,0.05)]",
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
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border font-display text-base tracking-wider",
          dark
            ? "border-[#F3EEE8]/30 bg-[#F3EEE8] text-[#17645F]"
            : "border-[#17645F] bg-[#17645F] text-[#F3EEE8]"
        )}
      >
        GB
      </div>
      <div className="leading-none">
        <div
          className={cn(
            "font-display text-xl tracking-[0.06em] uppercase",
            dark ? "text-[#F3EEE8]" : "text-[#17645F]"
          )}
        >
          GO.BODA
        </div>
        {subtitle ? (
          <div
            className={cn(
              "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
              dark ? "text-[#F3EEE8]/75" : "text-[#17645F]/70"
            )}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}
