export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const round = (value: number): number => {
  return Math.round(value * 100) / 100;
};
