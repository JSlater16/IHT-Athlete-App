const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { PrismaClient, Prisma } = require("@prisma/client");

dotenv.config({ path: path.resolve(__dirname, "..", "server", ".env") });

const prisma = new PrismaClient();

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function main() {
  const [, , nameArg, emailArg, passwordArg] = process.argv;

  if (!nameArg || !emailArg || !passwordArg) {
    console.error('Usage: node scripts/createCoach.js "Coach Name" "email@gym.com" "password123"');
    process.exit(1);
  }

  const name = nameArg.trim();
  const email = normalizeEmail(emailArg);
  const password = passwordArg;

  if (!name) {
    console.error("Coach name is required.");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const coach = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "COACH"
      }
    });

    console.log(`Coach created successfully: ${coach.name} <${coach.email}>`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      console.error("A coach with that email already exists.");
    } else {
      console.error("Failed to create coach:", error.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
