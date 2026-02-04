import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { CodeBlock } from '@/components/code-block';
import { DocsNav } from '@/components/docs-nav';

type Props = { params: Promise<{ locale: string }> };

export default async function SDKPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SDKContent />;
}

function SDKContent() {
  const t = useTranslations('docs.sdk');

  const basicUsage = `import { Tinycrab } from 'tinycrab';

// Initialize with API key
const tc = new Tinycrab({
  apiKey: process.env.OPENAI_API_KEY,
  dataDir: './agents', // Optional: where to store agent data
});

// Spawn an agent
const agent = await tc.agent('my-worker');

// Chat with the agent
const response = await agent.chat('Hello!');
console.log(response.content);

// Continue conversation with session
const followUp = await agent.chat('What did I just say?', {
  sessionId: response.sessionId,
});

// Clean up when done
await agent.destroy({ cleanup: true });`;

  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground mb-12">{t('description')}</p>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('installation')}</h2>
          <CodeBlock code="npm install tinycrab" lang="bash" />
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('basicUsage')}</h2>
          <CodeBlock code={basicUsage} lang="typescript" />
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('tinycrabClass')}</h2>
          <CodeBlock
            code={`new Tinycrab(options: {
  apiKey: string;      // LLM provider API key
  dataDir?: string;    // Default: './.tinycrab'
  provider?: string;   // Default: 'openai'
  model?: string;      // Default: provider's default
})`}
            lang="typescript"
          />
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('agentMethods')}</h2>
          <CodeBlock
            code={`// Spawn or get existing agent
const agent = await tc.agent(id: string);

// Chat with agent
const response = await agent.chat(message: string, options?: {
  sessionId?: string;  // Continue existing session
});

// Clean up
await agent.destroy(options?: {
  cleanup?: boolean;   // Delete all files (default: false)
});`}
            lang="typescript"
          />
        </section>

        <DocsNav current="sdk" />
      </div>
    </div>
  );
}
