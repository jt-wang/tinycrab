import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { Zap, Code2, Terminal, Globe, Server } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export default async function DocsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DocsContent />;
}

function DocsContent() {
  const t = useTranslations('docs.index');

  const docs = [
    { icon: Zap, key: 'quickstart', href: '/docs/quickstart' },
    { icon: Code2, key: 'sdk', href: '/docs/sdk' },
    { icon: Terminal, key: 'cli', href: '/docs/cli' },
    { icon: Globe, key: 'api', href: '/docs/api' },
    { icon: Server, key: 'deploy', href: '/docs/deploy' },
  ] as const;

  return (
    <div className="py-20">
      <div className="mx-auto max-w-4xl px-6">
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground mb-12">{t('description')}</p>

        <div className="grid md:grid-cols-2 gap-4">
          {docs.map(({ icon: Icon, key, href }) => (
            <Link key={href} href={href}>
              <Card className="h-full border-border/50 hover:border-crab/50 hover:bg-card/80 transition-colors cursor-pointer">
                <CardContent className="p-5">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{t(`${key}.title`)}</h3>
                  <p className="text-sm text-muted-foreground">{t(`${key}.description`)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
