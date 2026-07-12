import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Read a var from process.env or web/.env.local (local dev only). */
export function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = path.join(__dirname, '../../.env.local');
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8')
    .match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]
    ?.trim()
    .replace(/^"|"$/g, '');
}

/** Ensure getDb() can see a URL discovered in web/.env.local. */
export function ensureDbEnv(): string | undefined {
  const url = localEnv('APP_DATABASE_URL') ?? localEnv('DATABASE_URL');
  if (!url) return undefined;
  if (!process.env.APP_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.APP_DATABASE_URL = url;
  }
  return url;
}

export function runtimeDbUrl(): string | undefined {
  return process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? ensureDbEnv();
}
