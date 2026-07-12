export const runViewTransition = (update: () => void | Promise<void>) => {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    void update();
    return;
  }

  document.startViewTransition(update);
};
