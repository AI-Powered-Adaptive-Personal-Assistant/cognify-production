import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MicroCheckWidget, { MicroCheckData } from './chat/MicroCheckWidget';

const SIGNS_RE = /^\[Signs:\s*.*\]$/i;
const MICRO_CHECK_RE = /:::micro-check\s*([\s\S]*?):::/g;

/**
 * Renders an AI message as proper Markdown (GitHub-flavored: bold, lists,
 * tables, code, links), and transforms embedded formative :::micro-check blocks
 * into interactive 1-click comprehension widgets.
 */
export default function MarkdownMessage({
  content,
  language = 'English',
  uid,
  onPrerequisiteClick,
}: {
  content: string;
  language?: string;
  uid?: string;
  onPrerequisiteClick?: (conceptId: string, conceptName: string) => void;
}) {
  const cleanContent = content
    .split('\n')
    .filter((line) => !SIGNS_RE.test(line.trim()))
    .join('\n');

  // Parse micro-check blocks
  const parts: { type: 'text' | 'micro-check'; content: string; data?: MicroCheckData }[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(MICRO_CHECK_RE);

  while ((match = regex.exec(cleanContent)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: 'text', content: cleanContent.slice(lastIdx, match.index) });
    }
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.question && Array.isArray(parsed.options) && typeof parsed.correctIndex === 'number') {
        parts.push({ type: 'micro-check', content: match[0], data: parsed });
      } else {
        parts.push({ type: 'text', content: match[0] });
      }
    } catch {
      parts.push({ type: 'text', content: match[0] });
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < cleanContent.length) {
    parts.push({ type: 'text', content: cleanContent.slice(lastIdx) });
  }

  return (
    <div className="adaptive-response text-slate-100">
      {parts.map((part, i) => {
        if (part.type === 'micro-check' && part.data) {
          return (
            <MicroCheckWidget
              key={i}
              data={part.data}
              language={language}
              uid={uid}
              onPrerequisiteClick={onPrerequisiteClick}
            />
          );
        }
        return (
          <ReactMarkdown
            key={i}
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
            {part.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

