import { clsx, type ClassValue } from "clsx";
import { chain, first } from "lodash-es";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface User {
  firstName: string | null;
  lastName: string | null;
}

export const getInitials = (user: User | null) =>
  chain(user)
    .pick(["firstName", "lastName"])
    .values()
    .map((v) => first(v ?? ""))
    .join("")
    .value();
