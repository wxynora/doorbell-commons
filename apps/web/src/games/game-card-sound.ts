import type {DdzView} from './doudizhu/doudizhu-client';
import type {UnoView} from './uno/uno-client';
import type {LeafGameView} from './leaf-game/leaf-game-client';
import type {View as MahjongView} from './mahjong/mahjong-client';

/** Public state only; the host has already accepted this room and viewer. */
export function cardPlaySound(kind: string, previous: unknown, next: unknown): 'card' | 'tile' | null {
  if (!previous || !next) return null;
  const before = previous as {game_id:string;revision:number;round?:number};
  const after = next as typeof before;
  if (before.game_id !== after.game_id || after.revision <= before.revision || before.round !== after.round) return null;
  if (kind === 'doudizhu') {
    const a = previous as DdzView, b = next as DdzView;
    return b.players.some(p => p.played_count > (a.players.find(old => old.id === p.id)?.played_count ?? p.played_count)) ? 'card' : null;
  }
  if (kind === 'uno') {
    const a = previous as UnoView, b = next as UnoView;
    const last = a.recent_events.at(-1)?.seq ?? -1;
    return b.recent_events.some(e => e.seq > last && e.type === 'play') ? 'card' : null;
  }
  if (kind === 'leaf-game') {
    const a = previous as LeafGameView, b = next as LeafGameView;
    return b.pile.length > a.pile.length ? 'card' : null;
  }
  if (kind === 'mahjong') {
    const a = previous as MahjongView, b = next as MahjongView;
    return b.public.last_discard?.tile.id && b.public.last_discard.tile.id !== a.public.last_discard?.tile.id ? 'tile' : null;
  }
  return null;
}
