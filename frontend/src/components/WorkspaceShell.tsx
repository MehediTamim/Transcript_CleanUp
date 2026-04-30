// 2026-05-01 — Top-level page shell. Both routes nest inside this so they share
// the same gradient background, max-width, header slot, and footer note. The
// shell exposes `wide` so the Editor (two-pane workspace) can opt into a wider
// container than the simpler Hearing pipeline.

import type { ReactNode } from 'react'
import { shellBg } from '../lib/tokens'

type Props = {
  header: ReactNode
  children: ReactNode
  footer?: ReactNode
  // Wider max-width for the two-pane editor, narrower for single-flow pages.
  wide?: boolean
}

export function WorkspaceShell({ header, children, footer, wide = false }: Props) {
  const maxWidth = wide ? 'max-w-[1400px]' : 'max-w-6xl'
  return (
    <div className={shellBg}>
      <div
        className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-violet-600/[0.12] blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 h-[420px] w-[420px] rounded-full bg-fuchsia-600/[0.08] blur-[90px]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

      {/* 2026-05-01 — On lg+, the inner column inherits the shell's fixed
          h-screen so children (header / main / footer) can lay out with
          flex-1 + min-h-0 and produce internal scroll regions instead of
          pushing the page to grow. */}
      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full flex-col px-4 sm:px-6 lg:h-full lg:min-h-0 ${maxWidth}`}
      >
        <header className="shrink-0 pt-5 sm:pt-7">{header}</header>
        <main className="flex flex-1 flex-col py-6 sm:py-8 lg:min-h-0">
          {children}
        </main>
        <footer className="shrink-0 pb-6 pt-6 text-center text-[11px] text-zinc-600">
          {footer ?? 'Private to your browser session. Nothing here is legal advice.'}
        </footer>
      </div>
    </div>
  )
}
