// Preview only the player's selections. Positions, pickability, stage results
// and rewards still come from the server; requests remain strictly serial.
export function previewCollectionPicks(collection, picks) {
  if (!collection || !picks.length) return collection;
  const removed = new Set(picks.map(tile => tile.id));
  let tray = [...collection.tray];
  for (const tile of picks) {
    tray.push({id: tile.id, name: tile.name, tier: tile.tier});
    if (tray.filter(item => item.name === tile.name).length === 3)
      tray = tray.filter(item => item.name !== tile.name);
  }
  const tiles = collection.tiles.filter(tile => !removed.has(tile.id));
  return {...collection, tiles, tray, remaining: tiles.length};
}

export class CollectionPicks {
  constructor({send, onChange, onUnavailable}) {
    Object.assign(this, {send, onChange, onUnavailable, confirmed: null,
      picks: [], active: null, suspended: false, uncertain: false, disposed: false});
  }
  snapshot() {
    return {collection: previewCollectionPicks(this.confirmed, this.picks),
      pending: this.picks.length, uncertain: this.uncertain};
  }
  emit() { if (!this.disposed) this.onChange(this.snapshot()); }
  sync(collection) {
    if (this.disposed || this.confirmed === collection) return;
    // The active request's callback owns its acknowledgement. A React render
    // of an older view must not restore items still waiting for confirmation.
    if (this.active) return;
    this.confirmed = collection;
    this.emit();
  }
  enqueue(tileId) {
    const shown = this.snapshot().collection;
    if (this.disposed || this.suspended || this.uncertain || shown?.status !== 'active' ||
        shown.tray.length >= shown.capacity) return false;
    const tile = shown.tiles.find(item => item.id === tileId && item.selectable);
    if (!tile) return false;
    this.picks.push(tile);
    this.emit();
    this.drain();
    return true;
  }
  drain() {
    if (this.disposed || this.active || this.suspended || this.uncertain || !this.picks.length) return;
    const collection = this.confirmed;
    if (collection?.status !== 'active') {
      this.picks = [];
      this.emit();
      this.onUnavailable();
      return;
    }
    let unavailable = false;
    while (this.picks.length && !collection.tiles.some(item => item.id === this.picks[0].id && item.selectable)) {
      this.picks.shift();
      unavailable = true;
    }
    if (unavailable) {
      // Dropping a predicted triple can make the remaining preview exceed the
      // real pocket capacity. Keep only the in-order prefix that still fits.
      let shown = collection;
      let count = 0;
      for (const pick of this.picks) {
        if (shown.tray.length >= shown.capacity) break;
        shown = previewCollectionPicks(shown, [pick]);
        count++;
      }
      this.picks.length = count;
      this.emit();
      this.onUnavailable();
    }
    if (!this.picks.length) return;
    const tile = this.picks[0];
    this.active = tile;
    const args = {tileId: tile.id, sessionId: collection.session.id, revision: collection.pile.revision};
    Promise.resolve(this.send(args, data => this.accept(tile, data))).then(status => {
      if (this.disposed || this.active !== tile) return;
      if (status === 'pending') {
        // Keep the uncertain in-flight pick and its original App request ID;
        // discard unsent selections. The existing retry button confirms it.
        this.uncertain = true;
        this.picks = [tile];
      } else {
        this.active = null;
        this.picks = [];
      }
      this.emit();
    });
  }
  accept(tile, data) {
    if (this.disposed || this.active !== tile) return;
    this.active = null;
    this.uncertain = false;
    this.picks.shift();
    this.confirmed = data.collection;
    if (data.stageCompleted || data.collection?.status !== 'active') this.picks = [];
    this.emit();
    // App releases its existing request lock in finally, before this runs.
    queueMicrotask(() => this.drain());
  }
  suspend(value) {
    if (this.suspended === value) return;
    this.suspended = value;
    if (value) this.picks = this.active ? [this.active] : [];
    this.emit();
    if (!value) this.drain();
  }
  dispose() { this.disposed = true; this.picks = []; }
}
