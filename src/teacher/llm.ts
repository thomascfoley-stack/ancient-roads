export interface LLMConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function createLLM(config: LLMConfig) {
  const model = config.model ?? 'Qwen/Qwen3.6-35B-A3B';
  const baseUrl = config.baseUrl ?? 'https://api.deepinfra.com/v1/openai';

  return {
    model,
    async generate(userPrompt: string, systemPrompt: string): Promise<string> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 6000,
          // Qwen3 thinking mode wastes tokens/latency here; the `/no_think` prompt
          // token is unreliable, this template kwarg disables it deterministically.
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
      }

      const json = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      let content = json.choices[0]?.message?.content ?? '';
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      // Strip markdown code fences
      content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
      return content;
    },
  };
}
