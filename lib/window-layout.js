// Keep cards in document order for keyboard navigation, but place each one in
// the shortest column so a tall window doesn't hold up every other window.
export function createWindowLayout(container) {
  let cards = [];
  let pendingFrame = null;

  function layoutCards() {
    const width = container.getBoundingClientRect().width;
    if (!width) {
      return;
    }

    const style = getComputedStyle(container);
    const columns = Number(style.getPropertyValue('--window-columns'));
    const gap = Number.parseFloat(style.getPropertyValue('--window-gap'));
    const cardWidth = (width - gap * (columns - 1)) / columns;
    for (const card of cards) {
      card.style.width = `${cardWidth}px`;
    }

    // Set all widths before measuring, then write positions as a separate batch.
    const heights = cards.map((card) => card.getBoundingClientRect().height);
    const columnBottoms = Array(columns).fill(0);
    for (const [index, card] of cards.entries()) {
      const column = columnBottoms.indexOf(Math.min(...columnBottoms));
      card.style.left = `${column * (cardWidth + gap)}px`;
      card.style.top = `${columnBottoms[column]}px`;
      columnBottoms[column] += heights[index] + gap;
    }
    container.style.height = `${cards.length ? Math.max(...columnBottoms) - gap : 0}px`;
  }

  const observer = new ResizeObserver(() => {
    if (pendingFrame !== null) {
      return;
    }
    // Defer writes so changing the container height doesn't recurse during a
    // ResizeObserver notification. This also batches font and viewport changes.
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      layoutCards();
    });
  });

  return function updateWindowLayout() {
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
    observer.disconnect();
    cards = [...container.children];
    container.classList.add('packed-windows');
    layoutCards();
    observer.observe(container);
    for (const card of cards) {
      observer.observe(card);
    }
  };
}
