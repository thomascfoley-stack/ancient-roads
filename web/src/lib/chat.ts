import { runAsUser } from './db';

// All chat/channel data is user-scoped and RLS-protected. Every query runs through
// runAsUser so app.current_user_id is set (RLS backstop) in addition to the explicit
// user_id filters. See docs/SECURITY.md (SEC-2).

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  pinned_sources: string[];
  sort_order: number;
}

export interface Chat {
  id: string;
  title: string;
  persona: string;
  icon_color: string;
  is_archived: boolean;
  sort_order: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: Record<string, unknown>[];
  created_at: string;
}

export interface ChatMemory {
  id: string;
  fact_type: string;
  content: string;
  verse_refs: string[];
  confidence: number;
}

export async function getChannels(userId: string): Promise<Channel[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, name, description, icon, pinned_sources, sort_order
        FROM channels WHERE user_id = ${userId} ORDER BY sort_order, created_at`,
  ]);
  return rows as Channel[];
}

export async function createChannel(
  userId: string,
  name: string,
  description?: string,
): Promise<Channel> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO channels (user_id, name, description) VALUES (${userId}, ${name}, ${description ?? null})
        RETURNING id, name, description, icon, pinned_sources, sort_order`,
  ]);
  return (rows as Channel[])[0]!;
}

export async function getChats(userId: string): Promise<Chat[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, title, persona, icon_color, is_archived, sort_order
        FROM chats WHERE user_id = ${userId} AND is_archived = false
        ORDER BY sort_order, updated_at DESC`,
  ]);
  return rows as Chat[];
}

export async function createChat(
  userId: string,
  title: string,
  persona = 'general',
): Promise<Chat> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO chats (user_id, title, persona) VALUES (${userId}, ${title}, ${persona})
        RETURNING id, title, persona, icon_color, is_archived, sort_order`,
  ]);
  return (rows as Chat[])[0]!;
}

export async function getMessages(
  userId: string,
  channelId: string | null,
  chatId: string | null,
  limit = 50,
  before?: string,
): Promise<Message[]> {
  const [rows] = await runAsUser(userId, (sql) => {
    if (channelId) {
      return [
        before
          ? sql`SELECT id, role, content, sources, created_at FROM messages
                WHERE channel_id = ${channelId} AND created_at < ${before}
                ORDER BY created_at DESC LIMIT ${limit}`
          : sql`SELECT id, role, content, sources, created_at FROM messages
                WHERE channel_id = ${channelId} ORDER BY created_at DESC LIMIT ${limit}`,
      ];
    }
    return [
      before
        ? sql`SELECT id, role, content, sources, created_at FROM messages
              WHERE chat_id = ${chatId} AND created_at < ${before}
              ORDER BY created_at DESC LIMIT ${limit}`
        : sql`SELECT id, role, content, sources, created_at FROM messages
              WHERE chat_id = ${chatId} ORDER BY created_at DESC LIMIT ${limit}`,
    ];
  });
  return rows as Message[];
}

export async function addMessage(
  userId: string,
  channelId: string | null,
  chatId: string | null,
  role: 'user' | 'assistant' | 'system',
  content: string,
  sources: Record<string, unknown>[] = [],
): Promise<Message> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO messages (user_id, channel_id, chat_id, role, content, sources)
        VALUES (${userId}, ${channelId}, ${chatId}, ${role}, ${content}, ${JSON.stringify(sources)}::jsonb)
        RETURNING id, role, content, sources, created_at`,
  ]);
  return (rows as Message[])[0]!;
}

export async function getChatMemories(userId: string, chatId: string): Promise<ChatMemory[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, fact_type, content, verse_refs, confidence
        FROM chat_memories WHERE chat_id = ${chatId} AND is_active = true
        ORDER BY created_at DESC`,
  ]);
  return rows as ChatMemory[];
}

export async function addChatMemory(
  userId: string,
  chatId: string,
  factType: string,
  content: string,
  verseRefs: string[] = [],
): Promise<ChatMemory> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO chat_memories (user_id, chat_id, fact_type, content, verse_refs)
        VALUES (${userId}, ${chatId}, ${factType}, ${content}, ${JSON.stringify(verseRefs)}::jsonb)
        RETURNING id, fact_type, content, verse_refs, confidence`,
  ]);
  return (rows as ChatMemory[])[0]!;
}
