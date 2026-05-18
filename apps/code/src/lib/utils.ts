import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type EnvKey = 'VITE_CONVEX_URL' | 'VITE_CONVEX_SITE_URL';

export const getEnv = (key: EnvKey) => {
  const value = import.meta.env[key];
  if (!value) throw new Error(`Environment variable ${key} is not set`);
  return value;
};
