const bcrypt = require("bcryptjs");
const { prisma } = require("../src/utils/prisma");

const defaultOwner = {
  name: process.env.OWNER_NAME || "Head Coach",
  email: (process.env.OWNER_EMAIL || "owner@gym.com").trim().toLowerCase(),
  password: process.env.OWNER_PASSWORD || "changeme123"
};

async function main() {
  const existingOwner = await prisma.user.findUnique({
    where: { email: defaultOwner.email }
  });

  if (existingOwner) {
    if (existingOwner.role !== "OWNER" || existingOwner.isActive !== true) {
      await prisma.user.update({
        where: { id: existingOwner.id },
        data: {
          role: "OWNER",
          isActive: true
        }
      });
      console.log(`Updated existing owner account: ${defaultOwner.email}`);
      return;
    }

    console.log(`Owner account already exists: ${defaultOwner.email}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(defaultOwner.password, 10);

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
