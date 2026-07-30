// Types for neon-connection.mjs — in-process neonctl URL mint.
export declare const DEFAULT_NEON_PROJECT: string;

export declare function branchForTarget(target: string): string;

export declare function mintNeonConnectionString(opts: {
  branch: string;
  role: string;
  project: string;
  apiKey: string;
}): string;

export declare function resolveInstrumentConnection(opts: {
  target: string;
  role?: string;
}): {
  url: string;
  source: 'neonctl' | 'env';
  role: string | null;
  branch: string | null;
};
