import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5';

export interface ClaudeReply {
  text: string;
  model: string;
  stopReason: string;
}

/**
 * Single-turn coaching request straight from the browser. The key is the user's own and
 * lives on their device, which is the case the SDK's browser opt-in exists for.
 */
export async function askCoach(apiKey: string, system: string, userMessage: string, model = DEFAULT_MODEL): Promise<ClaudeReply> {
  const key = apiKey.trim();
  if (!key) throw new Error('Add your Anthropic API key in Settings first.');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 10 * 60 * 1000 });

  const response = await client.beta.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    // Server-side refusal fallback: if a safety classifier declines, the API re-runs on a suitable model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: userMessage }],
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

  if (response.stop_reason === 'refusal') {
    const details = (response as unknown as { stop_details?: { category?: string; explanation?: string } }).stop_details;
    throw new Error(
      `The model declined this request${details?.category ? ` [${details.category}]` : ''}${details?.explanation ? `: ${details.explanation}` : '.'}`,
    );
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('The model returned no text.');
  return { text, model: response.model, stopReason: response.stop_reason ?? '' };
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it in Settings.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a minute and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the API. Check your connection.';
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ''}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
