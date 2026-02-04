import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { CodeBlock } from '@/components/code-block';
import { DocsNav } from '@/components/docs-nav';

type Props = { params: Promise<{ locale: string }> };

export default async function DeployPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DeployContent />;
}

function DeployContent() {
  const t = useTranslations('docs.deploy');

  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="text-4xl font-bold text-foreground mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground mb-12">{t('description')}</p>

        <section className="mb-12" id="docker">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('docker')}</h2>
          <p className="text-muted-foreground mb-4">{t('dockerDesc')}</p>
          <CodeBlock
            code={`docker run -p 8080:8080 \\
  -e OPENAI_API_KEY=sk-xxx \\
  ghcr.io/jt-wang/tinycrab`}
            lang="bash"
          />

          <h3 className="text-lg font-semibold text-foreground mt-6 mb-2">{t('dockerCompose')}</h3>
          <CodeBlock
            code={`version: '3.8'
services:
  tinycrab:
    image: ghcr.io/jt-wang/tinycrab
    ports:
      - "8080:8080"
    environment:
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
    volumes:
      - ./data:/app/data`}
            lang="yaml"
          />
        </section>

        <section className="mb-12" id="railway">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('railway')}</h2>
          <p className="text-muted-foreground mb-4">{t('railwayDesc')}</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-2 mb-4">
            <li>{t('railwaySteps.step1')}</li>
            <li>{t('railwaySteps.step2')}</li>
            <li>
              {t('railwaySteps.step3').split('ghcr.io/jt-wang/tinycrab')[0]}
              <code className="text-foreground">ghcr.io/jt-wang/tinycrab</code>
            </li>
            <li>
              {t('railwaySteps.step4').split('OPENAI_API_KEY')[0]}
              <code className="text-foreground">OPENAI_API_KEY</code>
            </li>
          </ol>
        </section>

        <section className="mb-12" id="flyio">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('flyio')}</h2>
          <p className="text-muted-foreground mb-4">{t('flyioDesc')}</p>
          <CodeBlock
            code={`# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch
fly launch --image ghcr.io/jt-wang/tinycrab

# Set secrets
fly secrets set OPENAI_API_KEY=sk-xxx`}
            lang="bash"
          />
        </section>

        <section className="mb-12" id="render">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('render')}</h2>
          <p className="text-muted-foreground mb-4">{t('renderDesc')}</p>
          <ol className="list-decimal list-inside text-muted-foreground space-y-2">
            <li>{t('renderSteps.step1')}</li>
            <li>{t('renderSteps.step2')}</li>
            <li>
              {t('renderSteps.step3').split('ghcr.io/jt-wang/tinycrab')[0]}
              <code className="text-foreground">ghcr.io/jt-wang/tinycrab</code>
            </li>
            <li>
              {t('renderSteps.step4').split('OPENAI_API_KEY')[0]}
              <code className="text-foreground">OPENAI_API_KEY</code>
            </li>
          </ol>
        </section>

        <section id="usage">
          <h2 className="text-2xl font-semibold text-foreground mb-4">{t('usage')}</h2>
          <p className="text-muted-foreground mb-4">{t('usageDesc')}</p>
          <CodeBlock
            code={`$ curl -X POST https://your-deployment.com/chat \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello"}'
# → {"response": "Hello! How can I help?",
#    "session_id": "session-a1b2c3d4"}

# Continue conversation with session_id
$ curl -X POST https://your-deployment.com/chat \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What did I say?", "session_id": "session-a1b2c3d4"}'`}
            lang="bash"
          />
        </section>

        <DocsNav current="deploy" />
      </div>
    </div>
  );
}
