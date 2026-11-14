import { useMemo } from 'react';
import katex from 'katex';
import { splitMathText } from '../utils/answerKeyParser';

interface MathTextProps {
  text: string;
  className?: string;
}

export function MathText({ text, className = '' }: MathTextProps) {
  const segments = useMemo(() => splitMathText(text), [text]);

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return (
            <span key={idx} className="whitespace-pre-wrap">
              {seg.content}
            </span>
          );
        }

        const displayMode = seg.type === 'display-math';
        let html = '';
        try {
          html = katex.renderToString(seg.content, {
            displayMode,
            throwOnError: false,
            strict: false,
            trust: false,
          });
        } catch {
          html = seg.content;
        }

        if (displayMode) {
          return (
            <span
              key={idx}
              className="block my-2 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        return (
          <span
            key={idx}
            className="inline-block align-middle mx-0.5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
}
