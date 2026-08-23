// NewAdvent / Schaff (ANF-NPNF) patristic source — the reusable re-source module
// (resource-textmatch.ts) pointed at church-father PD translations. Unlike helloao
// (per-verse JSON), New Advent is organized by WORK (HTML), so the match is
// containment: is our stored snippet present in the PD work's full text? (repair)
// vs a different/modern translation? (drop). Reuses the same tokens/containment
// core — only the fetch differs.

export const NEWADVENT = 'https://www.newadvent.org/fathers';

// Fetch + strip a New Advent work (its pages) to plain text.
export async function fetchNewAdventText(urls: string[]): Promise<{ text: string; okPages: number }> {
  let text = '';
  let okPages = 0;
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (!res.ok) continue;
      const html = await res.text();
      text += ' ' + html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');
      okPages++;
    } catch { /* skip a failed page */ }
  }
  return { text, okPages };
}

const pages = (base: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${NEWADVENT}/${base}${from + i}.htm`);

export interface PatristicWork {
  author: string;      // our stored author string
  book: number;        // our book number (verse-anchor)
  work: string;
  edition: string;     // the PD edition (ANF/NPNF volume)
  urls: string[];
}

// Small verified-repairable sample — bounded ANF/NPNF works with confirmed New
// Advent pages — to prove per-work $0-repair holds BEFORE scaling the classify.
export const PATRISTIC_SAMPLE: PatristicWork[] = [
  { author: 'John Chrysostom', book: 48, work: 'Homilies on Galatians', edition: 'NPNF1-13 (Schaff, 1889)', urls: pages('2310', 1, 6) },
  { author: 'Augustine of Hippo', book: 62, work: 'Homilies on 1 John', edition: 'NPNF1-07 (Schaff, 1888)', urls: [...pages('17020', 1, 9), `${NEWADVENT}/170210.htm`] },
  { author: 'Origen of Alexandria', book: 43, work: 'Commentary on John', edition: 'ANF9 (Menzies, 1896)', urls: ['01', '02', '04', '05', '06', '10', '13', '19', '20', '28', '32'].map((n) => `${NEWADVENT}/1015${n}.htm`) },
];
