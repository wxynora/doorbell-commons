export type GameViewport = { width: number; height: number };

/** Keep the game canvas stable when a text keyboard removes viewport height. */
export function createGameViewportReader() {
  let previous: GameViewport | undefined;
  let direction: string | undefined;
  return (next: GameViewport, editing: boolean, orientation: string | undefined): GameViewport => {
    if (previous && editing && orientation === direction && next.width === previous.width && next.height < previous.height) {
      return previous;
    }
    direction = orientation;
    previous = next;
    return next;
  };
}

export function gameViewportReader() {
  const read = createGameViewportReader();
  return (size: GameViewport): GameViewport => {
    const element = document.activeElement;
    const editing = element instanceof HTMLElement &&
      (element.matches('input, textarea') || element.isContentEditable);
    return read(size, editing, window.screen.orientation?.type);
  };
}
