"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { audit } from "@/lib/audit";
import { allowedDomain, isAllowedEmail, isGoogleSignInEnabled } from "@/lib/auth-config";
import { db } from "@/lib/db";
import { ActionError, authorize } from "@/lib/dal";
import { isAdmin } from "@/lib/roles";
import { userSchema, type UserInput } from "@/lib/validation";

export async function saveUser(id: number | null, raw: UserInput) {
  return runAction(async () => {
    const admin = await authorize("manageUsers");
    const { password, ...input } = userSchema.parse(raw);

    if (!isAllowedEmail(input.email)) {
      throw new ActionError(`Only @${allowedDomain()} email addresses can be added.`);
    }
    // With Google sign-in, users never have a password; otherwise new users need one.
    const google = isGoogleSignInEnabled();
    if (!id && !password && !google) throw new ActionError("Set an initial password for the new user.");

    if (id) {
      const existing = await db.user.findUnique({ where: { id }, select: { roles: true, active: true } });
      if (!existing) throw new ActionError("User not found.");
      const losesAdmin = isAdmin(existing.roles) && existing.active && (!isAdmin(input.roles) || !input.active);
      if (losesAdmin) {
        const admins = await db.user.count({ where: { roles: { has: "ADMIN" }, active: true } });
        if (admins <= 1) throw new ActionError("There must always be at least one active admin.");
      }
      if (id === admin.id && !input.active) throw new ActionError("You can't deactivate your own account.");
    }

    const data = { ...input, ...(password && !google ? { passwordHash: await bcrypt.hash(password, 12) } : {}) };
    const user = id ? await db.user.update({ where: { id }, data }) : await db.user.create({ data });

    await audit({
      userId: admin.id,
      action: id ? "update" : "create",
      entityType: "user",
      entityId: user.id,
      description: `${id ? "Updated" : "Created"} user ${user.email}${password && id && !google ? " (password reset)" : ""}`,
    });
    revalidatePath("/users");
    return { id: user.id };
  });
}
