import Composio from '@composio/client';

export const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
});
