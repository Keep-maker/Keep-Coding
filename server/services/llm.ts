import { providerConfig } from '../config.js';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface StreamDelta {
  content?: string;
  toolCallChunk?: { index: number; id?: string; name?: string; argsFragment?: string };
  finishReason?: string | null;
}

/** Raised for any non-2xx response so the UI can show a precise message. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

function endpoint(): string {
  const { baseUrl } = providerConfig();
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/chat/completions`;
}

/**
 * Streams a chat completion from any OpenAI-compatible endpoint.
 * Yields incremental text deltas and tool-call fragments.
 */
export async function* streamChat(
  messages: ChatMessage[],
  tools: ToolSchema[],
  signal?: AbortSignal,
): AsyncGenerator<StreamDelta> {
  const provider = providerConfig();
  if (!provider.apiKey || provider.apiKey === 'sk-xxx') {
    throw new ProviderError(
      'No API key configured. Set CURSOR_FORK_API_KEY in .env or add your key in Settings.',
    );
  }

  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: provider.temperature,
    max_tokens: provider.maxTokens,
    stream: true,
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }

  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ProviderError(`Could not reach ${provider.baseUrl}: ${(err as Error).message}`);
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new ProviderError(
      `Provider returned ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 800)}` : ''}`,
      response.status,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let parsed: any;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = parsed.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};

      if (typeof delta.content === 'string' && delta.content.length) {
        yield { content: delta.content };
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const call of delta.tool_calls) {
          yield {
            toolCallChunk: {
              index: call.index ?? 0,
              id: call.id,
              name: call.function?.name,
              argsFragment: call.function?.arguments,
            },
          };
        }
      }
      if (choice.finish_reason) {
        yield { finishReason: choice.finish_reason };
      }
    }
  }
}

/** Non-streaming helper used by the lightweight inline-edit / title features. */
export async function complete(messages: ChatMessage[], maxTokens = 1500): Promise<string> {
  const provider = providerConfig();
  if (!provider.apiKey || provider.apiKey === 'sk-xxx') {
    throw new ProviderError('No API key configured. Add your key in Settings.');
  }
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: provider.temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ProviderError(`Provider returned ${response.status}: ${text.slice(0, 600)}`, response.status);
  }
  const json: any = await response.json();
  return json.choices?.[0]?.message?.content ?? '';
}
