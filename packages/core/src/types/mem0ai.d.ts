/**
 * `mem0ai` is an optional peer dependency (see memory/LongTermMemory.ts).
 * This ambient declaration lets the SDK type-check and compile without it
 * installed; consumers who `npm install mem0ai` get the real types from
 * that package instead, since a real .d.ts always wins over an ambient one.
 */
declare module "mem0ai" {
  export class Memory {
    constructor(config?: Record<string, unknown>);
    add(messages: unknown, options?: Record<string, unknown>): Promise<unknown>;
    search(query: string, options?: Record<string, unknown>): Promise<unknown>;
    deleteAll(options?: Record<string, unknown>): Promise<unknown>;
  }

  export class MemoryClient {
    constructor(config: { apiKey: string });
    add(messages: unknown, options?: Record<string, unknown>): Promise<unknown>;
    search(query: string, options?: Record<string, unknown>): Promise<unknown>;
    deleteAll(options?: Record<string, unknown>): Promise<unknown>;
  }
}
