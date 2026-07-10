export const runViewTransition = (update: () => void | Promise<void>) => {
  if (typeof document === 'undefined') {
    update();
    return;
  }

  document.startViewTransition(update);
};
