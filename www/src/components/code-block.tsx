'use client';

import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  lang?: string;
  className?: string;
}

export function CodeBlock({ code, lang = 'bash', className }: CodeBlockProps) {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    codeToHtml(code, {
      lang,
      theme: 'github-dark-default',
    }).then(setHtml);
  }, [code, lang]);

  if (!html) {
    return (
      <pre className={cn('rounded-lg bg-[#0d1117] p-4 text-sm whitespace-pre-wrap break-words', className)}>
        <code className="font-mono text-[#c9d1d9]">{code}</code>
      </pre>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden text-sm [&_pre]:p-4 [&_pre]:bg-[#0d1117] [&_pre]:whitespace-pre-wrap [&_code]:break-words',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
