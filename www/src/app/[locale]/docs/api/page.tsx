import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { CodeBlock } from '@/components/code-block';

type Props = { params: Promise<{ locale: string }> };

export default async function APIPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <APIContent />;
}

function APIContent() {
  const t = useTranslations('docs.api');

  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground mb-12">{t('description')}</p>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('postChat')}</h2>
          <p className="text-muted-foreground mb-4">{t('postChatDesc')}</p>
          <CodeBlock
            code={`curl -X POST http://localhost:9000/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hello!",
    "session_id": "optional-session-id"
  }'`}
            lang="bash"
          />
          <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">{t('response')}</h3>
          <CodeBlock
            code={`{
  "content": "Hello! How can I help you?",
  "session_id": "abc123",
  "tool_calls": []
}`}
            lang="json"
          />
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('getHealth')}</h2>
          <p className="text-muted-foreground mb-4">{t('getHealthDesc')}</p>
          <CodeBlock
            code={`curl http://localhost:9000/health

# Response: {"status": "ok", "agent": "my-agent"}`}
            lang="bash"
          />
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('getSessions')}</h2>
          <p className="text-muted-foreground mb-4">{t('getSessionsDesc')}</p>
          <CodeBlock
            code={`curl http://localhost:9000/sessions

# Response: {"sessions": ["abc123", "def456"]}`}
            lang="bash"
          />
        </section>
      </div>
    </div>
  );
}
