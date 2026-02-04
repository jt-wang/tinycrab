'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CrabIcon } from './crab-icon';
import { Github } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function Footer() {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 mt-20">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <Link href="/" className="flex items-center gap-2.5 font-semibold text-foreground mb-4">
              <CrabIcon className="w-5 h-5 text-crab" />
              <span>tinycrab</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('tagline')}
            </p>
          </div>

          <div>
            <h4 className="font-medium text-sm text-foreground mb-4">{t('docs')}</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/docs/quickstart" className="text-muted-foreground hover:text-foreground transition-colors">
                  Quickstart
                </Link>
              </li>
              <li>
                <Link href="/docs/sdk" className="text-muted-foreground hover:text-foreground transition-colors">
                  SDK Reference
                </Link>
              </li>
              <li>
                <Link href="/docs/cli" className="text-muted-foreground hover:text-foreground transition-colors">
                  CLI Reference
                </Link>
              </li>
              <li>
                <Link href="/docs/api" className="text-muted-foreground hover:text-foreground transition-colors">
                  HTTP API
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-sm text-foreground mb-4">{t('deploy')}</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/docs/deploy" className="text-muted-foreground hover:text-foreground transition-colors">
                  Docker
                </Link>
              </li>
              <li>
                <Link href="/docs/deploy#railway" className="text-muted-foreground hover:text-foreground transition-colors">
                  Railway
                </Link>
              </li>
              <li>
                <Link href="/docs/deploy#flyio" className="text-muted-foreground hover:text-foreground transition-colors">
                  Fly.io
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-sm text-foreground mb-4">{t('community')}</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="https://github.com/anthropics/tinycrab"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Github className="w-4 h-4" />
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/anthropics/tinycrab/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('issues')}
                </a>
              </li>
              <li>
                <Link href="/agents" className="text-muted-foreground hover:text-foreground transition-colors">
                  {t('forAgents')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8 bg-border/40" />

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {year} {t('copyright')}</p>
          <p>{t('builtFor')}</p>
        </div>
      </div>
    </footer>
  );
}
