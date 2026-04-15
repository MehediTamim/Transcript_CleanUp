import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  source: string
  className?: string
}

/** Renders markdown for preview (GFM: tables, strikethrough, task lists, etc.). */
export function MarkdownPreview({ source, className = '' }: Props) {
  return (
    <div
      className={`markdown-preview text-sm leading-relaxed text-zinc-200 ${className} [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-white [&_h1]:first:mt-0 [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_p]:mb-3 [&_p]:last:mb-0 [&_a]:text-violet-400 [&_a]:underline [&_a]:underline-offset-2 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-4 [&_blockquote]:text-zinc-400 [&_code]:rounded-md [&_code]:bg-white/[0.08] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-white/[0.08] [&_pre]:bg-black/50 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_th]:border [&_th]:border-white/[0.08] [&_th]:bg-white/[0.05] [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_td]:border [&_td]:border-white/[0.06] [&_td]:px-3 [&_td]:py-2 [&_td]:text-xs [&_tr:nth-child(even)]:bg-white/[0.02] [&_hr]:my-6 [&_hr]:border-white/[0.08]`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
