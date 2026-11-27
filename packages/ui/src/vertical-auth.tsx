"use client";

import * as React from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { BrandLogo } from "./primitives";
import { cn } from "./utils";

export interface VerticalAuthShellProps {
  /** Micro pill text above headline (e.g., "ZANZIBAR OPERATIONS") */
  eyebrow: string;
  /** First stacked line of display title */
  headlineTop: string;
  /** Second stacked line of display title */
  headlineBottom: string;
  /** Short 1-line description inside the top canopy */
  canopySubtitle: string;
  /** Optional hero background image (defaults to /images/bodaboda-hero.webp) */
  heroImageSrc?: string;
  /** Right-side header action (Language switcher or Sign Up/In pill) */
  topRight?: React.ReactNode;
  /** Sheet section heading */
  formTitle: string;
  /** Sheet section helper line */
  formSubtitle: string;
  /** Compact canopy height for longer vertical forms (like registration) */
  compactCanopy?: boolean;
  /** Inline error message rendered cleanly inside the sheet */
  error?: string | null;
  /** Form body */
  children: React.ReactNode;
  /** Bottom footer anchored to bottom edge of the vertical sheet */
  footer?: React.ReactNode;
}

export function VerticalAuthShell({
  eyebrow,
  headlineTop,
  headlineBottom,
  canopySubtitle,
  heroImageSrc = "/images/bodaboda-hero.webp",
  topRight,
  formTitle,
  formSubtitle,
  compactCanopy = false,
  error,
  children,
  footer,
}: VerticalAuthShellProps) {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-[#17645F] text-[#122927] sm:items-center sm:justify-center sm:bg-[#F3EEE8] sm:px-4 sm:py-8">
      {/* Vertical Phone-First Stage (Full-bleed on phone, framed vertical showcase on desktop) */}
      <div className="flex min-h-[100dvh] w-full flex-col bg-[#17645F] sm:min-h-[760px] sm:max-w-[420px] sm:overflow-hidden sm:rounded-[2.5rem] sm:border sm:border-[#17645F]/15 sm:shadow-[0_32px_90px_rgba(18,41,39,0.18)]">
        {/* Top Atmospheric Editorial Canopy */}
        <section
          className={cn(
            "relative overflow-hidden bg-[#17645F] px-6 text-[#F3EEE8]",
            compactCanopy ? "pt-5 pb-12" : "pt-6 pb-14"
          )}
        >
          {/* Editorial Bodaboda Backdrop + Deep Zanzibar Teal Vignette */}
          <img
            src={heroImageSrc}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover object-center opacity-25 mix-blend-luminosity select-none"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0C3734]/75 via-[#17645F]/80 to-[#17645F]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-14 -top-14 h-56 w-56 rounded-full border border-[#F3EEE8]/15 bg-[#F3EEE8]/10 blur-2xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 top-12 h-44 w-44 rounded-full border border-[#F3EEE8]/10"
          />

          {/* Top Navigation Bar */}
          <div className="relative z-10 flex items-center justify-between gap-3">
            <BrandLogo dark />
            {topRight ? <div className="shrink-0">{topRight}</div> : null}
          </div>

          {/* Vertical Editorial Headline Stack */}
          <div className={cn("relative z-10", compactCanopy ? "mt-6" : "mt-9")}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F3EEE8]/20 bg-[#0D3C38]/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F3EEE8]/90 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E9DFD3]" />
              <span>{eyebrow}</span>
            </div>

            <h1
              className={cn(
                "mt-3.5 font-display uppercase leading-[0.93] tracking-tight text-[#F3EEE8]",
                compactCanopy ? "text-[2.45rem]" : "text-[2.85rem]"
              )}
            >
              <span className="block">{headlineTop}</span>
              <span className="block text-[#E9DFD3]">{headlineBottom}</span>
            </h1>

            <p className="mt-2.5 max-w-[270px] text-[13px] font-medium leading-relaxed text-[#F3EEE8]/80">
              {canopySubtitle}
            </p>
          </div>
        </section>

        {/* Curved Warm-Paper Vertical Bottom Sheet */}
        <section className="relative z-10 -mt-7 flex flex-1 flex-col rounded-t-[2.25rem] bg-[#FAF7F2] px-6 pt-4 pb-7 shadow-[0_-18px_45px_rgba(10,46,43,0.26)]">
          {/* Native Sheet Handle Indicator */}
          <div
            aria-hidden="true"
            className="mx-auto mb-5 h-1.5 w-11 rounded-full bg-[#17645F]/15"
          />

          {/* Form Header */}
          <div>
            <h2 className="text-[22px] font-extrabold tracking-tight text-[#122927]">
              {formTitle}
            </h2>
            <p className="mt-1 text-xs font-medium text-[#17645F]/70">
              {formSubtitle}
            </p>
          </div>

          {/* Inline Error Alert */}
          {error ? (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#A93232]/25 bg-[#A93232]/10 px-4 py-3 text-xs font-semibold text-[#A93232]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Form Content */}
          <div className="mt-5 flex-1">{children}</div>

          {/* Bottom Anchored Footer */}
          {footer ? (
            <div className="mt-6 border-t border-[#17645F]/10 pt-4 text-center">
              {footer}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export interface VerticalAuthInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  icon: React.ReactNode;
}

export function VerticalAuthInput({
  label,
  icon,
  type = "text",
  className,
  ...props
}: VerticalAuthInputProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword ? (showPassword ? "text" : "password") : type;

  return (
    <label className="block">
      <span className="mb-1.5 block pl-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F]/75">
        {label}
      </span>
      <div className="group flex h-[54px] items-center gap-3 rounded-2xl border border-[#17645F]/15 bg-[#F3EEE8] px-3.5 transition-all duration-200 focus-within:border-[#17645F] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(23,100,95,0.10)]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FAF7F2] text-[#17645F] shadow-sm transition-colors group-focus-within:bg-[#17645F] group-focus-within:text-[#F3EEE8]">
          {icon}
        </span>
        <input
          type={resolvedType}
          className={cn(
            "w-full min-w-0 bg-transparent text-base font-medium text-[#122927] placeholder:text-[#17645F]/40 focus:outline-none",
            className
          )}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#17645F]/60 transition hover:bg-[#17645F]/10 hover:text-[#17645F]"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
    </label>
  );
}

export function VerticalAuthSubmit({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="group mt-2 flex h-[56px] w-full items-center justify-center gap-2.5 rounded-full bg-[#17645F] px-6 text-sm font-extrabold uppercase tracking-[0.15em] text-[#F3EEE8] shadow-[0_12px_28px_rgba(23,100,95,0.28)] transition-all duration-200 hover:bg-[#114E4A] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-60"
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{busyLabel}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </>
      )}
    </button>
  );
}
