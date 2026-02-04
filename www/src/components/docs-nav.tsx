'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Code2, Terminal, Server, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

type DocPage = 'quickstart' | 'sdk' | 'cli' | 'deploy';

interface DocsNavProps {
  current?: DocPage;
}

export function DocsNav({ current }: DocsNavProps) {
  const t = useTranslations('docs.index');

  const pages = [
    { key: 'quickstart' as const, href: '/docs/quickstart', icon: Rocket },
    { key: 'sdk' as const, href: '/docs/sdk', icon: Code2 },
    { key: 'cli' as const, href: '/docs/cli', icon: Terminal },
    { key: 'deploy' as const, href: '/docs/deploy', icon: Server },
  ];

  return (
    <div className="mt-16 pt-8 border-t border-border/40">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        {t('title')}
      </h3>
      <div className="grid sm:grid-cols-4 gap-4">
        {pages.map(({ key, href, icon: Icon }) => {
          const isCurrent = current === key;
          return (
            <Link key={key} href={href}>
              <Card
                className={cn(
                  'h-full transition-colors cursor-pointer',
                  isCurrent
                    ? 'border-crab bg-crab/5'
                    : 'border-border/50 hover:border-crab/50'
                )}
              >
                <CardContent className="p-4 text-center">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center mx-auto mb-3',
                      isCurrent ? 'bg-crab/20' : 'bg-muted'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4',
                        isCurrent ? 'text-crab' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      'font-medium text-sm',
                      isCurrent ? 'text-crab' : 'text-foreground'
                    )}
                  >
                    {t(`${key}.title`)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
