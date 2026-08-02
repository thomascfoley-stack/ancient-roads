// Types for source-artifact-urls.mjs. Kept beside it for the same reason
// forbidden-provenance.d.mts is: the module is plain .mjs so every runtime in this repo
// (tsx scripts, next build, plain node) can import it, and the types ride alongside.

export interface SourceArtifact {
  /** Filename to store the fetched bytes under, within the work's archive directory. */
  name: string;
  /** Alternatives, tried in order; the first success wins. */
  urls: string[];
}

export type ArtifactSources =
  | { ok: true; kind: string; artifacts: SourceArtifact[] }
  | { ok: false; kind: string; reason: string };

export function ccelXmlUrl(ccelId: string): string;
export function expandCcelIdPattern(pattern: unknown): string[];
export function gutenbergTextUrls(ebookId: string | number): string[];
export function archiveDjvuTextUrl(identifier: string): string;
export function githubRawUrl(repo: string, ref: string, filePath: string): string;
export function artifactSourcesFor(entry: unknown): ArtifactSources;
export const DERIVABLE_ADAPTERS: readonly string[];
