import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

interface BotSeed {
  username: string;
  displayName: string;
  webhookUrl: string | null;
}

const bots: BotSeed[] = [
  {
    username: "hermes_agent",
    displayName: "Hermes Agent",
    webhookUrl: null, // inbound-only (webhooks.ts)
  },
  {
    username: "dev_bot",
    displayName: "Dev Bot",
    webhookUrl: (process.env.HERMES_WEBHOOK_URL ?? "http://172.17.0.1:8645") + "/inbound",
  },
  {
    username: "writing_bot",
    displayName: "Writing Bot",
    webhookUrl: (process.env.HERMES_WEBHOOK_URL ?? "http://172.17.0.1:8645") + "/inbound",
  },
];

async function main() {
  for (const bot of bots) {
    const email = `${bot.username}@bots.chat-universal.local`;

    await prisma.user.upsert({
      where: { username: bot.username },
      update: {
        displayName: bot.displayName,
        webhookUrl: bot.webhookUrl,
      },
      create: {
        email,
        username: bot.username,
        displayName: bot.displayName,
        isBot: true,
        webhookUrl: bot.webhookUrl,
        passwordHash: await bcrypt.hash(
          crypto.randomBytes(32).toString("hex"),
          10
        ),
      },
    });

    console.log(`✓ Bot "${bot.username}" (${bot.displayName}): webhookUrl=${bot.webhookUrl ?? "—"}`);
  }

  console.log("\n✅ Seed concluído!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
