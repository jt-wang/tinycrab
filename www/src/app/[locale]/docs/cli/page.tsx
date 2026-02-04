import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { CodeBlock } from '@/components/code-block';

type Props = { params: Promise<{ locale: string }> };

export default async function CLIPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CLIContent />;
}

function CLIContent() {
  const t = useTranslations('docs.cli');

  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground mb-12">{t('description')}</p>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('spawn')}</h2>
          <p className="text-muted-foreground mb-4">{t('spawnDesc')}</p>
          <CodeBlock
            code={`tinycrab spawn <agent-id> [options]

Options:
  --port, -p     Port for HTTP server (default: auto)
  --provider     LLM provider (default: openai)
  --model, -m    Model to use`}
            lang="bash"
          />
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('chat')}</h2>
          <p className="text-muted-foreground mb-4">{t('chatDesc')}</p>
          <CodeBlock
            code={`tinycrab chat <agent-id> [message] [options]

Options:
  --session, -s  Continue existing session
  --interactive, -i  Interactive mode`}
            lang="bash"
          />
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('list')}</h2>
          <p className="text-muted-foreground mb-4">{t('listDesc')}</p>
          <CodeBlock code="tinycrab list" lang="bash" />
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('stop')}</h2>
          <p className="text-muted-foreground mb-4">{t('stopDesc')}</p>
          <CodeBlock code="tinycrab stop <agent-id>" lang="bash" />
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('cleanup')}</h2>
          <p className="text-muted-foreground mb-4">{t('cleanupDesc')}</p>
          <CodeBlock code="tinycrab cleanup <agent-id>" lang="bash" />
        </section>
      </div>
    </div>
  );
}
