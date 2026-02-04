import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { CodeBlock } from '@/components/code-block';
import { DocsNav } from '@/components/docs-nav';
import { CheckCircle2 } from 'lucide-react';

type Props = { params: Promise<{ locale: string }> };

export default async function QuickstartPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <QuickstartContent />;
}

function QuickstartContent() {
  const t = useTranslations('docs.quickstart');

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
            <CodeBlock code="$ npm install -g tinycrab" lang="bash" />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step2')}</h2>
            <CodeBlock
              code={`# OpenAI (default)
$ export OPENAI_API_KEY=sk-xxx

# Or Anthropic
$ export ANTHROPIC_API_KEY=sk-xxx`}
              lang="bash"
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step3')}</h2>
            <CodeBlock
              code={`$ tinycrab spawn my-agent
# → Agent 'my-agent' spawned
# → Server running on port 9000`}
              lang="bash"
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step4')}</h2>
            <CodeBlock
              code={`$ tinycrab chat my-agent "Create a hello world script"
# → [my-agent]: I've created hello.py that prints "Hello, World!"
# → (session: session-a1b2c3d4)

# Interactive mode
$ tinycrab chat my-agent -i
# → Interactive session with 'my-agent'
# → Type 'exit' to quit.
# → my-agent> _`}
              lang="bash"
            />
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-4">{t('step5')}</h2>
            <CodeBlock
              code={`$ tinycrab list
# → NAME          STATUS      PORT
# → my-agent      running     9000

$ tinycrab stop my-agent
# → Agent 'my-agent' stopped

$ tinycrab cleanup my-agent
# → Agent 'my-agent' cleaned up`}
              lang="bash"
            />
          </section>
        </div>

        <DocsNav current="quickstart" />
      </div>
    </div>
  );
}
