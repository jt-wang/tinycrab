import Fastify from "fastify";
import { MessageBus } from "../bus.js";

export async function startHttp(bus: MessageBus, port: number): Promise<void> {
  const app = Fastify();
  const pending = new Map<string, (res: string) => void>();

  bus.subscribe("http", (msg) => {
    pending.get(msg.chatId)?.(msg.content);
    pending.delete(msg.chatId);
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: { message: string; session_id?: string } }>("/chat", async (req, reply) => {
    if (!req.body?.message) {
      return reply.status(400).send({ error: "message is required" });
    }

    const chatId = req.body.session_id || crypto.randomUUID().slice(0, 8);

    const promise = new Promise<string>((resolve) => pending.set(chatId, resolve));
    await bus.publishInbound({ channel: "http", chatId, content: req.body.message });
    const response = await promise;

    return { response, session_id: chatId };
  });

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`HTTP server on port ${port}`);
}
