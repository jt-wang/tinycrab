export interface InboundMessage {
  channel: string;
  chatId: string;
  content: string;
  /** Optional thread ID for nested conversations */
  threadId?: string;
}

export interface OutboundMessage {
  channel: string;
  chatId: string;
  content: string;
}

export class MessageBus {
  private queue: InboundMessage[] = [];
  private resolvers: ((msg: InboundMessage) => void)[] = [];
  private subscribers = new Map<string, Array<(msg: OutboundMessage) => void>>();

  async publishInbound(msg: InboundMessage): Promise<void> {
    if (this.resolvers.length > 0) {
      this.resolvers.shift()!(msg);
    } else {
      this.queue.push(msg);
    }
  }

  async consumeInbound(): Promise<InboundMessage> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    return new Promise((resolve) => this.resolvers.push(resolve));
  }

  async publishOutbound(msg: OutboundMessage): Promise<void> {
    for (const cb of this.subscribers.get(msg.channel) || []) {
      cb(msg);
    }
  }

  subscribe(channel: string, callback: (msg: OutboundMessage) => void): void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, []);
    }
    this.subscribers.get(channel)!.push(callback);
  }
}
