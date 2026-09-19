import { chain, first } from "lodash-es";
export { cn } from "cn";

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
