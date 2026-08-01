// Types for publish-flip-guard.mjs.
export declare function assertPublishTarget(
  url: string | undefined | null,
  opts: { allow: boolean; declared?: string; localOk?: boolean },
): string;
