'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { codeToHtml } from 'shiki';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  lang?: string;
  className?: string;
}

export function CodeBlock({ code, lang = 'bash', className }: CodeBlockProps) {
  const [html, setHtml] = useState<string>('');
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const theme = resolvedTheme === 'dark' ? 'github-dark-default' : 'github-light';
    codeToHtml(code, {
      lang,
      theme,
    }).then(setHtml);
  }, [code, lang, resolvedTheme, mounted]);

  const isDark = resolvedTheme === 'dark';

  if (!html || !mounted) {
    return (
      <pre
        className={cn(
          'rounded-lg p-4 text-sm whitespace-pre-wrap break-words',
          isDark ? 'bg-[#0d1117] text-[#c9d1d9]' : 'bg-[#f6f8fa] text-[#24292f]',
          className
        )}
      >
        <code className="font-mono">{code}</code>
      </pre>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden text-sm [&_pre]:p-4 [&_pre]:whitespace-pre-wrap [&_code]:break-words',
        isDark ? '[&_pre]:bg-[#0d1117]' : '[&_pre]:bg-[#f6f8fa]',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
