"use client";

import * as React from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { cn } from "./utils";

export interface EditorialHeroFeature {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}

export interface EditorialScrollHeroProps {
  eyebrowItems: string[];
  displayWordLeft: string;
  displayWordRight: string;
  taglineLines: string[];
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  imageSrc: string;
  imageAlt: string;
  features: EditorialHeroFeature[];
  scrollHint?: string;
  compact?: boolean;
  className?: string;
}

export function EditorialScrollHero({
  eyebrowItems,
  displayWordLeft,
  displayWordRight,
  taglineLines,
  ctaLabel,
  ctaHref = "#workspace",
  onCtaClick,
  imageSrc,
  imageAlt,
  features,
  scrollHint = "Scroll to continue",
  compact = false,
  className,
}: EditorialScrollHeroProps) {
  const containerRef = React.useRef<HTMLElement | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);

    let rafId = 0;
    const update = () => {
      rafId = 0;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const travel = Math.max(240, rect.height * 0.82);
      const raw = -rect.top / travel;
      const clamped = Math.max(0, Math.min(1, raw));
      setProgress(clamped);
    };

    const onScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const p = reducedMotion ? 0 : progress;

  const handleCta = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onCtaClick) {
      e.preventDefault();
      onCtaClick();
      return;
    }
    if (ctaHref.startsWith("#")) {
      const target = document.querySelector(ctaHref);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  return (
    <section
      ref={containerRef}
      className={cn(
        "relative overflow-hidden border-b border-[#17645F]/15 bg-[#F3EEE8] text-[#17645F]",
        compact
          ? "min-h-[430px] sm:min-h-[480px]"
          : "min-h-[540px] sm:min-h-[620px] lg:min-h-[680px]",
        className
      )}
    >
      {/* Top Scroll Progress Hairline */}
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-[2.5px] bg-transparent">
        <div
          className="h-full bg-[#17645F] transition-[width] duration-75"
          style={{ width: `${Math.round(p * 100)}%` }}
        />
      </div>

      {/* Subtle warm editorial vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 62%, rgba(23,100,95,0.06) 0%, rgba(243,238,232,0) 64%)",
        }}
      />

      <div
        className={cn(
          "relative mx-auto flex h-full w-full max-w-6xl flex-col justify-between px-4 sm:px-8",
          compact ? "py-6 sm:py-8" : "py-8 sm:py-12"
        )}
      >
        {/* Top Dot-Separated Micro-Eyebrow */}
        <div
          className="relative z-30 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] font-bold uppercase tracking-[0.26em] text-[#17645F]/85 sm:text-[11px]"
          style={{
            transform: `translate3d(0, ${(-p * 18).toFixed(1)}px, 0)`,
            opacity: Number((1 - p * 0.65).toFixed(3)),
            willChange: "transform, opacity",
          }}
        >
          {eyebrowItems.map((item, idx) => (
            <React.Fragment key={item}>
              {idx > 0 ? (
                <span className="h-1 w-1 rounded-full bg-[#17645F]/55" />
              ) : null}
              <span>{item}</span>
            </React.Fragment>
          ))}
        </div>

        {/* Center Layered Composition: Giant Condensed Display Type + Foreground Bodaboda Cutout */}
        <div
          className={cn(
            "relative flex flex-1 flex-col items-center justify-center",
            compact ? "mt-2 min-h-[290px] sm:min-h-[340px]" : "mt-3 min-h-[380px] sm:min-h-[460px]"
          )}
        >
          {/* BACK LAYER — Giant Edge-to-Edge Condensed Display Headline */}
          <h1
            aria-label={`${displayWordLeft} ${displayWordRight}`}
            className={cn(
              "pointer-events-none relative z-10 flex w-full select-none flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center font-display uppercase leading-[0.88] text-[#17645F] sm:gap-x-5",
              (displayWordLeft + displayWordRight).length > 13
                ? compact
                  ? "text-[clamp(2.5rem,7.2vw,5.8rem)]"
                  : "text-[clamp(2.9rem,9.2vw,7.8rem)]"
                : compact
                  ? "text-[clamp(3.4rem,10.5vw,7.4rem)]"
                  : "text-[clamp(3.8rem,13.2vw,10.2rem)]"
            )}
            style={{
              transform: `translate3d(0, ${(-p * 54).toFixed(1)}px, 0) scale(${(1 + p * 0.04).toFixed(4)})`,
              letterSpacing: `${(0.01 + p * 0.03).toFixed(4)}em`,
              opacity: Number((1 - p * 0.4).toFixed(3)),
              willChange: "transform, opacity",
            }}
          >
            <span>{displayWordLeft}</span>
            <span>{displayWordRight}</span>
          </h1>

          {/* GROUND SHADOW beneath tires — shifts dynamically with scroll */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 left-1/2 z-10 h-7 w-[240px] -translate-x-1/2 rounded-full bg-[#17645F]/25 blur-xl sm:w-[360px]"
            style={{
              transform: `translate3d(-50%, 0, 0) scaleX(${(1 + p * 0.22).toFixed(3)})`,
              opacity: Number((0.45 - p * 0.22).toFixed(3)),
              willChange: "transform, opacity",
            }}
          />

          {/* FOREGROUND LAYER — Photorealistic Bodaboda Overlapping the Typography */}
          <div
            className={cn(
              "pointer-events-none relative z-20 flex items-end justify-center",
              compact
                ? "-mt-16 sm:-mt-24 lg:-mt-28"
                : "-mt-16 sm:-mt-28 lg:-mt-36"
            )}
            style={{
              transform: `translate3d(${(p * 16).toFixed(1)}px, ${(-p * 18).toFixed(1)}px, 0) scale(${(1 + p * 0.1).toFixed(4)}) rotate(${(-p * 1.4).toFixed(2)}deg)`,
              willChange: "transform",
            }}
          >
            <img
              src={imageSrc}
              alt={imageAlt}
              className={cn(
                "w-auto max-w-full object-contain drop-shadow-[0_22px_28px_rgba(15,63,60,0.22)]",
                compact
                  ? "max-h-[235px] sm:max-h-[285px]"
                  : "max-h-[285px] sm:max-h-[375px] lg:max-h-[430px]"
              )}
            />
          </div>

          {/* BOTTOM-LEFT EDITORIAL TAGLINE + PILL CTA (Overlaid neatly on desktop, stacked on mobile) */}
          <div
            className="relative z-30 mt-5 flex w-full flex-col items-start justify-between gap-6 sm:flex-row sm:items-end lg:pointer-events-none lg:absolute lg:bottom-2 lg:left-0 lg:right-0 lg:mt-0"
          >
            <div
              className="pointer-events-auto max-w-[230px] space-y-4"
              style={{
                transform: `translate3d(${(-p * 26).toFixed(1)}px, ${(-p * 20).toFixed(1)}px, 0)`,
                opacity: Number((1 - p * 0.72).toFixed(3)),
                willChange: "transform, opacity",
              }}
            >
              <div className="h-[1.5px] w-8 bg-[#17645F]" />
              <div className="space-y-0.5 text-[11px] font-bold uppercase leading-snug tracking-[0.18em] text-[#17645F]">
                {taglineLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <a
                href={ctaHref}
                onClick={handleCta}
                className="inline-flex items-center gap-3 rounded-full border border-[#17645F] bg-[#F3EEE8]/85 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#17645F] backdrop-blur-sm transition-all duration-200 hover:bg-[#17645F] hover:text-[#F3EEE8]"
              >
                <span>{ctaLabel}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* BOTTOM-RIGHT VERTICAL EDITORIAL FEATURE RAIL */}
            <div
              className="pointer-events-auto border-l border-[#17645F]/25 pl-4"
              style={{
                transform: `translate3d(${(p * 26).toFixed(1)}px, ${(-p * 20).toFixed(1)}px, 0)`,
                opacity: Number((1 - p * 0.72).toFixed(3)),
                willChange: "transform, opacity",
              }}
            >
              <ul className="space-y-3">
                {features.map((feat) => (
                  <li key={feat.title} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#17645F]/35 bg-[#FAF7F2] text-[#17645F]">
                      {feat.icon}
                    </span>
                    <div className="text-[10px] font-bold uppercase leading-tight tracking-[0.16em] text-[#17645F]">
                      <p>{feat.title}</p>
                      {feat.subtitle ? (
                        <p className="mt-0.5 font-semibold text-[#17645F]/70">
                          {feat.subtitle}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Scroll Cue */}
        <div
          className="relative z-30 mt-5 flex justify-center"
          style={{
            opacity: Number((1 - p * 1.4).toFixed(3)),
          }}
        >
          <a
            href={ctaHref}
            onClick={handleCta}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-[#17645F]/65 transition hover:text-[#17645F]"
          >
            <span>{scrollHint}</span>
            <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function ScrollReveal({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -30px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={cn(
        "transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform",
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "translate-y-6 scale-[0.985] opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}
