// 2026-05-01 — Centralised Tailwind class tokens for the redesigned workspace.
// Both EditorPage (/) and HearingPage (/v2) import from here so they share the
// same surface treatment, padding, radii, and accent colours. Touch this file
// to retheme the whole app rather than chasing inline classnames in pages.

// Glass-style raised panel surface used by every section card.
export const panelSurface =
  'rounded-[1.5rem] border border-white/[0.06] bg-zinc-900/40 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-xl'

export const panelPad = 'p-5 sm:p-6'
export const panelPadLg = 'p-6 sm:p-8'

export const subtleBorder = 'border border-white/[0.06]'
export const innerSurface = 'rounded-2xl border border-white/[0.05] bg-black/25'

// Typography helpers.
export const eyebrow =
  'text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500'
export const sectionTitle = 'text-sm font-semibold text-white'
export const sectionHelp = 'mt-1 text-xs leading-relaxed text-zinc-500'
export const mutedText = 'text-zinc-400'
export const subtleText = 'text-zinc-500'

// Buttons. Compose with size/state classes per usage.
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40'
export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 transition hover:border-white/[0.14] hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40'
export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500/90 px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-500'
export const btnSuccess =
  'inline-flex items-center justify-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-5 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40'

// Form inputs.
export const inputBase =
  'w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 text-sm text-zinc-100 outline-none transition focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-zinc-600'
export const textareaBase =
  'w-full resize-y rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3 text-sm leading-relaxed text-zinc-100 outline-none transition focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60 placeholder:text-zinc-600'

// Background / decorative gradients used by the WorkspaceShell.
// 2026-05-01 — lg:h-screen pins the desktop layout to the viewport so the
// two-pane workspace never grows past the screen; internal scrollers handle
// long content. Mobile keeps min-h-screen so the page can scroll naturally.
export const shellBg =
  'relative min-h-screen overflow-hidden bg-[#070708] text-zinc-100 lg:h-screen lg:min-h-0'

// Lightweight class joiner — avoids a runtime dependency on clsx for one helper.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
