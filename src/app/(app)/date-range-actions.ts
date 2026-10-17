"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { ActionError, authorize } from "@/lib/dal";
import { ALL_DATES, DATE_RANGE_COOKIE, resolveRange } from "@/lib/date-range";

/** Sets the app-wide date range ("all" = no filter). Lasts a working day, like the sign-in; then this FY again. */
export async function setDateRange(value: string) {
  return runAction(async () => {
    await authorize();
    if (value !== ALL_DATES && !resolveRange(value)) throw new ActionError("Pick a valid date range.");
    (await cookies()).set(DATE_RANGE_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    // Every page's data depends on it.
    revalidatePath("/", "layout");
  });
}
