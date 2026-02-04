import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CodeBlock } from '@/components/code-block';
import { Terminal, Code2, Globe, Bot } from 'lucide-react';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AgentsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AgentsContent />;
}

function AgentsContent() {
  const t = useTranslations('agents');

  const cliCode = `$ npm install -g tinycrab
$ export OPENAI_API_KEY=sk-xxx

$ tinycrab spawn worker
# → Agent 'worker' spawned
# → Server running on port 9000

$ tinycrab chat worker "Create a config file"
# → [worker]: I've created config.json with default settings.
# → (session: session-a1b2c3d4)

$ tinycrab cleanup worker
# → Agent 'worker' cleaned up`;

  const sdkCode = `import { Tinycrab } from 'tinycrab';

const tc = new Tinycrab({
  apiKey: process.env.OPENAI_API_KEY,
});

const agent = await tc.agent('worker');
const result = await agent.chat('List files in current directory');

console.log(result.response);
// → Here are the files: package.json, src/, README.md
console.log(result.sessionId);
// → session-a1b2c3d4e5f6

await agent.destroy({ cleanup: true });`;

  const httpCode = `$ tinycrab spawn worker
# → Server running on port 9000

$ curl -X POST http://localhost:9000/chat \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello"}'
# → {"response": "Hello! I'm ready to help.",
#    "session_id": "session-a1b2c3d4"}`;

  const sessionCode = `$ tinycrab chat worker "My name is Alice"
# → [worker]: Nice to meet you, Alice!
# → (session: session-abc123)

$ tinycrab chat worker "What's my name?" -s session-abc123
# → [worker]: Your name is Alice!`;

  const tools = [
    { code: 'bash', desc: t('tools.bash') },
    { code: 'read', desc: t('tools.read') },
    { code: 'write', desc: t('tools.write') },
    { code: 'edit', desc: t('tools.edit') },
    { code: 'grep', desc: t('tools.grep') },
    { code: 'find', desc: t('tools.find') },
    { code: 'ls', desc: t('tools.ls') },
    { code: 'remember/recall', desc: t('tools.memory'), highlight: true },
  ];

  return (
    <div className="py-20">
      <div className="mx-auto max-w-3xl px-6">
        {/* Header */}
        <div className="mb-12">
          <Badge variant="secondary" className="mb-4">
            <Bot className="w-3 h-3 mr-1.5" />
            {t('reference')}
          </Badge>
          <h1 className="text-4xl font-bold text-foreground mb-4">{t('title')}</h1>
          <p className="text-xl text-muted-foreground">{t('description')}</p>
        </div>

        {/* Reference URL */}
        <Card className="mb-12 border-crab/30 bg-crab/5">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-2">{t('reference')}:</p>
            <a
              href="https://tinycrab.dev/skill.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-crab font-mono hover:underline"
            >
              GET https://tinycrab.dev/skill.md
            </a>
          </CardContent>
        </Card>

        {/* Quick Start */}
        <h2 className="text-2xl font-semibold text-foreground mb-6">{t('quickStart')}</h2>

        <div className="space-y-6 mb-12">
          <Card className="overflow-hidden border-border/50">
            <CardContent className="p-0">
              <div className="p-4 border-b border-border/50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="font-semibold text-foreground">CLI</span>
              </div>
              <CodeBlock code={cliCode} lang="bash" />
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50">
            <CardContent className="p-0">
              <div className="p-4 border-b border-border/50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Code2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="font-semibold text-foreground">SDK</span>
              </div>
              <CodeBlock code={sdkCode} lang="typescript" />
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/50">
            <CardContent className="p-0">
              <div className="p-4 border-b border-border/50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <span className="font-semibold text-foreground">HTTP</span>
                  <p className="text-xs text-muted-foreground">Spawn first, then call HTTP</p>
                </div>
              </div>
              <CodeBlock code={httpCode} lang="bash" />
            </CardContent>
          </Card>
        </div>

        <Separator className="my-12 bg-border/40" />

        {/* Capabilities */}
        <h2 className="text-2xl font-semibold text-foreground mb-6">{t('capabilities')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('toolsFrom')}{' '}
          <a
            href="https://github.com/badlogic/pi-mono"
            className="text-crab hover:underline"
            target="_blank"
            rel="noopener"
          >
            pi-mono
          </a>
          :
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-12">
          {tools.map(({ code, desc, highlight }) => (
            <div
              key={code}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50"
            >
              <code className={`font-mono text-sm ${highlight ? 'text-crab' : 'text-foreground'}`}>
                {code}
              </code>
              <span className="text-sm text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>

        <Separator className="my-12 bg-border/40" />

        {/* Session */}
        <h2 className="text-2xl font-semibold text-foreground mb-4">{t('session')}</h2>
        <p className="text-muted-foreground mb-6">{t('sessionDesc')}:</p>
        <CodeBlock code={sessionCode} lang="bash" />

        {/* Full Ref */}
        <Card className="mt-12 border-border/50">
          <CardContent className="p-5">
            <p className="text-muted-foreground">
              {t('fullRef')}:{' '}
              <a href="/skill.md" className="text-crab hover:underline font-medium">
                /skill.md
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
