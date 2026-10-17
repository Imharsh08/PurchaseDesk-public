"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/dal";
import { disconnectGmail } from "@/lib/gmail";

export async function disconnectMyGmail() {
  return runAction(async () => {
    const user = await authorize();
    await disconnectGmail(user.id);
    await audit({ userId: user.id, action: "gmail", entityType: "user", entityId: user.id, description: "Disconnected Gmail" });
    revalidatePath("/", "layout");
  });
}
