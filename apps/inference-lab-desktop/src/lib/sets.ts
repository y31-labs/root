export const updateSetMembership = <T>(current: Set<T>, value: T, included: boolean) => {
  if (current.has(value) === included) return current;
  const next = new Set(current);
  if (included) next.add(value);
  else next.delete(value);
  return next;
};
