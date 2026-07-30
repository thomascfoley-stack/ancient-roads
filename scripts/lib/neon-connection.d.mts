// Types for neon-connection.mjs
export declare const DEFAULT_NEON_PROJECT: string;
export declare const INSTRUMENT_ROLE: string;

export declare function scrubCredentialText(text: unknown, apiKey?: string): string;
export declare function branchForTarget(target: string): string;
export declare function mintNeonConnectionString(opts: {
  branch: string;
  role: string;
  project: string;
  apiKey: string;
}): string;
export declare function assertReadOnlySession(
  client: { query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }> },
  opts?: { role?: string },
): Promise<{ readOnly: true; role: string }>;
export declare function resolveInstrumentConnection(opts: {
  target: string;
  role?: string;
}): {
  url: string;
  source: 'neonctl';
  role: string;
  branch: string;
};
