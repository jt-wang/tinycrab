import * as readline from "readline";
import { MessageBus } from "../bus.js";

export function startCli(bus: MessageBus): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  bus.subscribe("cli", (msg) => {
    console.log(`\n${msg.content}\n`);
    rl.prompt();
  });

  console.log("Agent ready. Type 'exit' to quit.\n");
  rl.setPrompt("> ");
  rl.prompt();

  rl.on("line", async (line) => {
    if (line.trim().toLowerCase() === "exit") process.exit(0);
    if (line.trim()) {
      await bus.publishInbound({ channel: "cli", chatId: "main", content: line });
    } else {
      rl.prompt();
    }
  });
}
