import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { CodeBlock } from '@/components/code-block';
import Link from 'next/link';
import { CheckCircle2, Code2, Terminal, Server } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export default async function QuickstartPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <QuickstartContent />;
}

function QuickstartContent() {
  const t = useTranslations('docs.quickstart');
  const nav = useTranslations('docs.index');

  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground mb-12">{t('description')}</p>

        {/* Prerequisites */}
        <Card className="mb-12 border-border/50 bg-card/50">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">{t('prerequisites')}</h2>
            <ul className="space-y-2">
              <li className="flex items-center gap-3 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-crab flex-shrink-0" />
                {t('prereq1')}
              </li>
              <li className="flex items-center gap-3 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-crab flex-shrink-0" />
                {t('prereq2')}
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step1')}</h2>
            <CodeBlock code="npm install -g tinycrab" lang="bash" />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step2')}</h2>
            <CodeBlock
              code={`# OpenAI (default)
export OPENAI_API_KEY=sk-xxx

# Or Anthropic
export ANTHROPIC_API_KEY=sk-xxx`}
              lang="bash"
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step3')}</h2>
            <CodeBlock
              code={`# Create and start an agent
tinycrab spawn my-agent

# Output:
# Agent 'my-agent' spawned
# Server running on port 9000`}
              lang="bash"
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step4')}</h2>
            <CodeBlock
              code={`# Send a message
tinycrab chat my-agent "What can you help me with?"

# Interactive mode
tinycrab chat my-agent -i`}
              lang="bash"
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step5')}</h2>
            <CodeBlock
              code={`# List all agents
tinycrab list

# Stop an agent (keeps files)
tinycrab stop my-agent

# Delete agent and all files
tinycrab cleanup my-agent`}
              lang="bash"
            />
          </section>
        </div>

        {/* Next Steps */}
        <h2 className="text-xl font-semibold text-foreground mt-12 mb-6">{t('nextSteps')}</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Link href="/docs/sdk">
            <Card className="h-full border-border/50 hover:border-crab/50 transition-colors cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
                  <Code2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="font-medium text-foreground text-sm">{nav('sdk.title')}</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/cli">
            <Card className="h-full border-border/50 hover:border-crab/50 transition-colors cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="font-medium text-foreground text-sm">{nav('cli.title')}</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/docs/deploy">
            <Card className="h-full border-border/50 hover:border-crab/50 transition-colors cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
                  <Server className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="font-medium text-foreground text-sm">{nav('deploy.title')}</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
