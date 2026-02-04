import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CrabSpawnDemo } from '@/components/crab-spawn-demo';
import { CodeBlock } from '@/components/code-block';
import Link from 'next/link';
import {
  Terminal,
  Code2,
  Server,
  FolderOpen,
  MessageSquare,
  Brain,
  Clock,
  GitBranch,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations();

  const sdkCode = `import { Tinycrab } from 'tinycrab';

const tc = new Tinycrab({ apiKey: process.env.OPENAI_API_KEY });
const agent = await tc.agent('worker');

const result = await agent.chat('Write a hello world script');
console.log(result.response);
// → I've created hello.py with a simple hello world script.
//   The file prints "Hello, World!" when run.

await agent.destroy({ cleanup: true });`;

  const cliCode = `$ npm install -g tinycrab

$ tinycrab spawn my-agent
# → Agent 'my-agent' spawned
# → Server running on port 9000

$ tinycrab chat my-agent "Create a README"
# → [my-agent]: I've created README.md with project
#   documentation including installation and usage.
# → (session: abc123)

$ tinycrab cleanup my-agent
# → Agent 'my-agent' cleaned up`;

  const dockerCode = `$ docker run -p 8080:8080 \\
  -e OPENAI_API_KEY=sk-xxx \\
  ghcr.io/jt-wang/tinycrab
# → Agent server running on port 8080

$ curl -X POST localhost:8080/chat \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello"}'
# → {"response": "Hello! How can I help you?",
#    "session_id": "session-a1b2c3..."}`;

  const features = [
    { icon: Terminal, key: 'coding' },
    { icon: FolderOpen, key: 'workspace' },
    { icon: MessageSquare, key: 'session' },
    { icon: Brain, key: 'memory' },
    { icon: Clock, key: 'scheduling' },
    { icon: GitBranch, key: 'selfSpawn' },
  ];

  return (
    <div className="relative">
      {/* Hero */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <Badge variant="secondary" className="mb-6">
            <Sparkles className="w-3 h-3 mr-1.5" />
            {t('hero.badge')}
          </Badge>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-4">
            {t('hero.title')}{' '}
            <span className="text-crab">{t('hero.titleHighlight')}</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            {t('hero.description')}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link href="/docs/quickstart">
                {t('hero.getStarted')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/agents">{t('hero.imAnAgent')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Crab Spawn Demo */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-xl font-semibold text-center mb-8 text-foreground">
            {t('spawn.title')}
          </h2>
          <CrabSpawnDemo />
        </div>
      </section>

      <Separator className="max-w-6xl mx-auto bg-border/40" />

      {/* Why Section */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                {t('why.title')}
              </h2>
              <p className="text-muted-foreground mb-6">{t('why.description')}</p>

              <ul className="space-y-3 mb-6 inline-block text-left">
                <li className="flex items-start gap-3 text-muted-foreground">
                  <span className="text-crab mt-1">•</span>
                  <span>
                    {t('why.items.testing.before')}
                    <span className="text-crab">{t('why.items.testing.highlight')}</span>
                    {t('why.items.testing.after')}
                  </span>
                </li>
                <li className="flex items-start gap-3 text-muted-foreground">
                  <span className="text-crab mt-1">•</span>
                  <span>
                    {t('why.items.prototyping.before')}
                    <span className="text-crab">{t('why.items.prototyping.highlight')}</span>
                    {t('why.items.prototyping.after')}
                  </span>
                </li>
                <li className="flex items-start gap-3 text-muted-foreground">
                  <span className="text-crab mt-1">•</span>
                  <span>
                    {t('why.items.platform.before')}
                    <span className="text-crab">{t('why.items.platform.highlight')}</span>
                    {t('why.items.platform.after')}
                  </span>
                </li>
                <li className="flex items-start gap-3 text-muted-foreground">
                  <span className="text-crab mt-1">•</span>
                  <span>
                    {t('why.items.simulation.before')}
                    <span className="text-crab">{t('why.items.simulation.highlight')}</span>
                    {t('why.items.simulation.after')}
                  </span>
                </li>
                <li className="flex items-start gap-3 text-muted-foreground">
                  <span className="text-crab mt-1">•</span>
                  <span>
                    {t('why.items.swarm.before')}
                    <span className="text-crab">{t('why.items.swarm.highlight')}</span>
                    {t('why.items.swarm.after')}
                    <Badge variant="outline" className="ml-2 text-xs">
                      soon
                    </Badge>
                  </span>
                </li>
              </ul>

              <p className="text-foreground font-medium">{t('why.conclusion')}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Three Ways */}
      <section className="py-20 bg-muted/30">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-3">
              {t('ways.title')}
            </h2>
            <p className="text-muted-foreground">{t('ways.description')}</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="border-border/50 overflow-hidden">
              <CardContent className="p-0">
                <div className="p-5 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                      <Code2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{t('ways.sdk')}</h3>
                      <p className="text-xs text-muted-foreground">{t('ways.sdkDesc')}</p>
                    </div>
                  </div>
                </div>
                <CodeBlock code={sdkCode} lang="typescript" />
              </CardContent>
            </Card>

            <Card className="border-border/50 overflow-hidden">
              <CardContent className="p-0">
                <div className="p-5 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                      <Terminal className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{t('ways.cli')}</h3>
                      <p className="text-xs text-muted-foreground">{t('ways.cliDesc')}</p>
                    </div>
                  </div>
                </div>
                <CodeBlock code={cliCode} lang="bash" />
              </CardContent>
            </Card>

            <Card className="border-border/50 overflow-hidden">
              <CardContent className="p-0">
                <div className="p-5 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                      <Server className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{t('ways.docker')}</h3>
                      <p className="text-xs text-muted-foreground">{t('ways.dockerDesc')}</p>
                    </div>
                  </div>
                </div>
                <CodeBlock code={dockerCode} lang="bash" />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-3">
              {t('features.title')}
            </h2>
            <p className="text-muted-foreground">{t('features.description')}</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, key }) => (
              <div key={key} className="p-5">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">
                  {t(`features.${key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(`features.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Deploy */}
      <section className="py-20 bg-muted/30">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-3">{t('deploy.title')}</h2>
          <p className="text-muted-foreground mb-6">{t('deploy.description')}</p>

          <CodeBlock
            code={`docker run -p 8080:8080 -e OPENAI_API_KEY=sk-xxx ghcr.io/jt-wang/tinycrab`}
            lang="bash"
          />

          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <Button variant="outline" asChild>
              <Link href="/docs/deploy">Deploy Guide</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="text-muted-foreground mb-4">{t('cta.ready')}</p>
          <CodeBlock code="npm install -g tinycrab && tinycrab spawn my-agent" lang="bash" />

          <p className="mt-8 text-sm text-muted-foreground border-t border-border/40 pt-8">
            {t('cta.future')}
          </p>
        </div>
      </section>
    </div>
  );
}
