import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SIGNS_RE = /^\[Signs:\s*.*\]$/i;

/**
 * Renders an AI message as proper Markdown (GitHub-flavored: bold, lists,
 * tables, code, links).
 *
 * Older stored messages may still contain a legacy `[Signs: 🤟👋]` line — the
 * AI used to append one, rendered as a row of generic emoji. That line was
 * NOT real sign language (Egyptian/ASL/etc.) and risked implying it was, so
 * generation of it was removed. Deaf/hard-of-hearing users get an accurate
 * translation instead via the "Show in sign language" button in
 * ChatInterface, which drives the real SignAvatar3D avatar off the actual
 * reply text. We still strip any leftover legacy line here so old messages
 * don't render a stray "[Signs: ...]" bracket.
 */
export default function MarkdownMessage({ content }: { content: string }) {
  const body = content
    .split('\n')
    .filter((line) => !SIGNS_RE.test(line.trim()))
    .join('\n');

  return (
    <div className="adaptive-response text-slate-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...p }: any) => <h2 className="text-xl font-black text-cyan-400 border-b border-slate-800/80 pb-2 mb-3 pt-4 tracking-tight" {...p} />,
          h2: ({ node, ...p }: any) => <h2 className="text-xl font-black text-cyan-400 border-b border-slate-800/80 pb-2 mb-3 pt-4 tracking-tight" {...p} />,
          h3: ({ node, ...p }: any) => <h3 className="text-lg font-bold text-white mb-2 pt-3" {...p} />,
          p: ({ node, ...p }: any) => <p className="mb-4 leading-relaxed text-slate-200" {...p} />,
          ul: ({ node, ...p }: any) => <ul className="list-disc ms-6 mb-4 space-y-1.5 marker:text-cyan-400 text-slate-200" {...p} />,
          ol: ({ node, ...p }: any) => <ol className="list-decimal ms-6 mb-4 space-y-1.5 marker:text-cyan-400 text-slate-200" {...p} />,
          li: ({ node, ...p }: any) => <li className="leading-relaxed" {...p} />,
          a: ({ node, href, ...p }: any) => {
            const isSafe = href && !href.trim().toLowerCase().startsWith('javascript:') && !href.trim().toLowerCase().startsWith('data:');
            return (
              <a
                className="text-cyan-400 underline underline-offset-4 decoration-cyan-500/40 hover:text-cyan-300 transition-colors font-semibold"
                target="_blank"
                rel="noopener noreferrer"
                href={isSafe ? href : '#'}
                {...p}
              />
            );
          },
          strong: ({ node, ...p }: any) => <strong className="font-black text-white" {...p} />,
          em: ({ node, ...p }: any) => <em className="italic text-slate-300" {...p} />,
          hr: ({ node, ...p }: any) => <hr className="my-5 border-slate-800" {...p} />,
          blockquote: ({ node, ...p }: any) => <blockquote className="border-s-4 border-cyan-500/60 bg-[#0A0C14]/80 px-4 py-3 rounded-e-2xl italic text-slate-300 my-4 shadow-inner" {...p} />,
          pre: ({ node, ...p }: any) => <pre className="bg-[#0B0E17] text-cyan-300 border border-slate-800/90 rounded-2xl p-4 overflow-x-auto text-xs my-4 shadow-2xl custom-scrollbar" {...p} />,
          code: ({ node, className, children, ...p }: any) => {
            const isBlock = (className && className.includes('language-')) || String(children).includes('\n');
            return isBlock ? (
              <code className={`font-mono text-cyan-300 ${className || ''}`} {...p}>{children}</code>
            ) : (
              <code className="px-2 py-0.5 rounded-lg bg-[#0A0C14] border border-slate-800 text-cyan-300 text-[0.85em] font-mono shadow-inner" {...p}>{children}</code>
            );
          },
          table: ({ node, ...p }: any) => <div className="overflow-x-auto my-5 rounded-2xl border border-slate-800 bg-[#0A0C14]/60"><table className="w-full text-xs text-slate-200 border-collapse" {...p} /></div>,
          th: ({ node, ...p }: any) => <th className="border-b border-slate-800 bg-[#0E111D] px-4 py-3 text-start font-black text-cyan-300 uppercase tracking-wider" {...p} />,
          td: ({ node, ...p }: any) => <td className="border-b border-slate-800/50 px-4 py-2.5" {...p} />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
