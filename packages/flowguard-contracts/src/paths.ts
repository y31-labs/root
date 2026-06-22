export const jsonPathRoot = '$';

export const jsonPath = (parent: string, key: string | number): string => {
  if (typeof key === 'number') {
    return `${parent}[${key}]`;
  }

  return isJsonPathIdentifier(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
};

const isJsonPathIdentifier = (value: string): boolean => {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
};
