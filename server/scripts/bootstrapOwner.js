const bcrypt = require("bcryptjs");
const { prisma } = require("../src/utils/prisma");

const defaultOwner = {
  name: process.env.OWNER_NAME || "Head Coach",
  email: (process.env.OWNER_EMAIL || "owner@gym.com").trim().toLowerCase(),
  password: process.env.OWNER_PASSWORD || "changeme123"
};

async function main() {
  /* Cost 12 brings owner bootstrap in line with every other bcrypt
     call site. The few extra ms only happen at install/migration
     time. */
  const hashedPassword = await bcrypt.hash(defaultOwner.password, 12);
  const ownerByEmail = await prisma.user.findUnique({
    where: { email: defaultOwner.email }
  });
  const existingOwner = await prisma.user.findFirst({
    where: { role: "OWNER" },
    orderBy: { createdAt: "asc" }
  });

  if (ownerByEmail) {
    await prisma.user.update({
      where: { id: ownerByEmail.id },
      data: {
        name: defaultOwner.name,
        role: "OWNER",
        isActive: true
      }
    });
    console.log(`Owner account already exists: ${defaultOwner.email}`);
    return;
  }

  if (existingOwner) {
    /* Previously this silently rewrote the existing owner's email
       and password whenever OWNER_EMAIL changed, which made it
       trivial to lock out the live owner by re-running the script
       with a typo. Require an explicit --force to confirm intent;
       otherwise leave the existing record alone and just log. */
    if (!process.argv.includes("--force")) {
      console.warn(
        `[bootstrapOwner] existing OWNER (${existingOwner.email}) does not match OWNER_EMAIL (${defaultOwner.email}). ` +
          `Refusing to rewrite without --force. Re-run with --force to migrate the owner record.`
      );
      return;
    }

    await prisma.user.update({
      where: { id: existingOwner.id },
      data: {
        name: defaultOwner.name,
        email: defaultOwner.email,
        password: hashedPassword,
        role: "OWNER",
        isActive: true
      }
    });
    console.log(`Migrated owner account to: ${defaultOwner.email}`);
    return;
  }

  await prisma.user.create({
    data: {
      name: defaultOwner.name,
      email: defaultOwner.email,
      password: hashedPassword,
      role: "OWNER",
      isActive: true
    }
  });

  console.log(`Created owner account: ${defaultOwner.email}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Failed to bootstrap owner account:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
