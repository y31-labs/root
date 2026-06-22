export const errorText = (caught: unknown): string => {
  if (caught instanceof Error) return caught.message;
  return String(caught);
};
