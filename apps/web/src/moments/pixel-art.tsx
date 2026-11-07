import { ResidentAvatar } from "./resident-avatar";
import type { SceneEnvironment } from "./scene-data";
import cover from "./cover-pixel.svg?raw";
import loader from "./loading-pixel.svg?raw";

const pixelRows = {
computer:['................','..oooooooooooo..','..occcccccccco..','..ocaaaaaaaa co..'.replace(' ',''),'..ocaabaaaabaco..','..ocaabaaaabaco..','..ocaaaaaaaaaco..','..ocaaabbbaaaco..','..ocaaaaaaaaaco..','..occcccccccco..','..occccddcccco..','..oooooooooooo..','...occcccc co...'.replace(' ',''),'..ocddddddddco..','.occcccccccccco.','.oooooooooooooo.'],
fish:['................','.......oo.......','......oaao......','....oooaaao.....','..ooaaaaaao..oo.','.oacaaaaaaaooaao','oaaaoaaaaaaa aaao'.replace(' ',''),'oaaaaoaaaaa aaaao'.replace(' ',''),'oaaaaaoaaaaaaaao','.oaaaaaoaaaaoaao','..ooaaaaaao..oo.','....ooaaao......','......oao.......','.......o........','................','................'],
pumpkin:['.......oo.......','......obbo......','......obbo......','...ooooobooo....','..oaaaoaaoaao...','.oaadaoaadaaoo..','oaaadaoaadaaaoo.','oaaadaoaadaa aao'.replace(' ',''),'oaaadaoaadaa aao'.replace(' ',''),'oaaadaoaadaa aao'.replace(' ',''),'.oaadaoaadaaoo..','..oaaaoaaoaao...','...ooooooooo....','................','................','................'],
meal:['......c.........','..c...c...c.....','..c.......c.....','................','...oooooooooo...','..oaaaaaaaaaao..','.oabbbabbbabaao.','.oooooooooooooo.','..oddddddddddo..','..oddddddddddo..','...oddddddddo...','....oddddddo....','.....oooooo.....','................','................','................'],
odd:['.....c..........','..c..c....c.....','..........c.....','................','....ooooooo.....','...oaaaabaao....','..oabbaaaaaao...','..oaaaabaaaao...','...oaaaaaaao....','....ooooooo.....','......oo........','......oo........','......oo........','......oo........','................','................'],
bait:['................','................','.....oooo.......','....oaaaao......','....oaooao......','....oao.ao......','.....o..ao......','........ao......','...oo..oao......','..oaaooao.......','..oaaaao........','...oooo.........','................','................','................','................'],
news:['................','..oooooooooooo..','..occcccccccco..','..ocaaaca aaaco..'.replace(' ',''),'..ocaaaca aaaco..'.replace(' ',''),'..occcccccccco..','..ocaaacaaaaco..','..ocaaacaaaaco..','..occcccccccco..','..ocaaaaaaaaco..','..occcccccccco..','..ocaaacaaaaco..','..occcccccccco..','..oooooooooooo..','................','................'],
folder:['................','................','..oooooo........','..occccooooooo..','..occcccccccco..','..oooooooooooo..','.occcccccccccco.','.occcccccccccco.','.occcccccccccco.','.occcccccccccco.','.occcccccccccco.','.occcccccccccco.','.oooooooooooooo.','................','................','................'],
castle:['................','..o..o....o..o..','..oooo....oooo..','..occo....occo..','..occoooooocco..','..occcccccccco..','..ocaacccaacco..','..occcccccccco..','..occcccccccco..','..occcooo cccco..'.replace(' ',''),'..occoaaao ccco..'.replace(' ',''),'..occoaaao ccco..'.replace(' ',''),'..oooooooooooo..','................','................','................'],
leaf:['................','........ooo.....','.......obbbo....','.....oobbbbo....','....obbbbbbo....','....obbbbbo.....','.....obboo......','......obo.......','..ooo..oo.......','.obbbo.oo.......','.obbbbooo.......','..obbbboo.......','...oooooo.......','.......oo.......','................','................'],
mushroom:['................','.....oooooo.....','....oaaaaaao....','...oacaaca aao...'.replace(' ',''),'..oaaaaaaaaaao..','..oacaacaacaao..','..oooooooooooo..','......occo......','......occo......','.....occcco.....','.....oooooo.....','................','................','................','................','................']} as const;
export type PixelKind = keyof typeof pixelRows;
const palettes: Partial<Record<PixelKind, Record<string, string>>> = {
  fish: { a: "#93b7bd", b: "#c9dfcd", c: "#425c57" },
  pumpkin: { a: "#d5a15c", b: "#8ca367", c: "#f5d080", d: "#b48249" },
  meal: { a: "#b6c18a", b: "#79975c", c: "#b7b29a", d: "#d7b88a" },
  odd: { a: "#c5b576", b: "#b8c580", c: "#b7b29a" }, bait: { a: "#ca9e8d" },
  castle: { a: "#8aa4a4" }, computer: { a: "#9aafb9", b: "#f8efd9", c: "#e9d8b9", d: "#beae91" },
};
export function Pixel({ kind, size = 32 }: { kind: PixelKind; size?: number }) {
  const colors: Record<string, string> = { o: "#8d7e69", a: "#b5c3a0", b: "#8ea970", c: "#e9dbb3", d: "#b6bd92", ...palettes[kind] };
  return <svg className="pixel-sprite" viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
    {pixelRows[kind].flatMap((row, y) => [...row].map((c, x) => colors[c] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={colors[c]} /> : null))}
  </svg>;
}
const icons = {bell:'<path d="M9 2h6v3h3v10h3v3H3v-3h3V5h3ZM9 21h6"/>',heart:'<path d="M3 4H9V6H15V4H21V6H23V11H21V14H18V17H15V20H13V22H11V20H9V17H6V14H3V11H1V6H3Z"/>',chat:'<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/>',gift:'<path d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/>',archive:'<path d="M3 3h18v5H3zM5 8v13h14V8M9 12h6"/>',smile:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9v2m8-2v2m-8 4q4 4 8 0"/>',edit:'<path d="m14 4 6 6M3 21l5-1L21 7a2 2 0 0 0-4-4L4 16l-1 5Z"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>'} as const;
export function Icon({ name }: { name: keyof typeof icons }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icons[name] }} />;
}
export const Avatar = ResidentAvatar;
export function PixelCover({ paused, environment = null }: { paused: boolean; environment?: SceneEnvironment | null }) {
  // Fixed hand-drawn artwork only. API values select known scene variants.
  return <div className={`cover-world${paused ? " motion-paused" : ""}`} data-season={environment?.season.id ?? "unknown"} data-weather={environment?.weather?.condition ?? "unknown"} dangerouslySetInnerHTML={{ __html: cover }} />;
}
export function Loading({ label = "正在加载动态" }: { label?: string }) {
  return <div className="feed-loading" role="status"><div dangerouslySetInnerHTML={{ __html: loader }} /><span>{label}</span></div>;
}
