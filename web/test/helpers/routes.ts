import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const API_ROOT = path.join(__dirname, '../../src/app/api');

export function listApiRouteFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'route.ts') out.push(full);
    }
  };
  walk(API_ROOT);
  return out.sort();
}

export function readRouteSource(file: string): string {
  return readFileSync(file, 'utf-8');
}

export function routeSpendsMoney(src: string): boolean {
  return (
    src.includes("from '@/lib/teacher/teach'") ||
    src.includes('from "@/lib/teacher/teach"') ||
    /\bteach\s*\(/.test(src)
  );
}

export function relRoute(file: string): string {
  return path.relative(API_ROOT, file).replace(/\\/g, '/');
}
