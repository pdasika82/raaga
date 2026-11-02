// Grade through OpenAI when the server has no Anthropic key: Raaga's Anthropic Messages request in,
// an Anthropic-shaped reply out, so the browser's prompt and parsing stay exactly as shipped.
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';

function part(block) {
  if (block.type === 'image') return { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
  return { type: 'text', text: block.text };
}

export async function gradeWithOpenAI(body) {
  const messages = [{ role: 'system', content: body.system }, ...body.messages.map(m => ({ role: m.role, content: m.content.map(part) }))];
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, max_completion_tokens: body.max_tokens }),
  });
  const data = await upstream.json();
  if (!upstream.ok) return { status: upstream.status, reply: { type: 'error', error: { type: 'api_error', message: data.error?.message || 'grading failed' } } };
  const choice = data.choices[0];
  return {
    status: 200,
    reply: {
      id: data.id, type: 'message', role: 'assistant', model: data.model,
      content: [{ type: 'text', text: choice.message.content || '' }],
      stop_reason: choice.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
      usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
    },
  };
}
