import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireApiKey } from "../middleware/auth.js";

const router = Router();

const createBotSchema = z.object({
  username: z.string().min(2).max(40).regex(/^[a-z0-9_]+$/),
  displayName: z.string().min(1).max(60),
});

const registerSchema = z.object({
  bot_token: z.string().min(1),
  webhook_url: z.string().url().max(1024),
});

// POST /api/bots — Cria um bot e retorna o token (requer API key master)
router.post("/", requireApiKey(config.hermesApiKey), async (req, res) => {
  const parsed = createBotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
  }

  const { username, displayName } = parsed.data;
  const email = `${username}@bots.chat-universal.local`;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) {
    return res.status(409).json({ error: `Bot "${username}" already exists` });
  }

  const botToken = `cu_bot_${crypto.randomBytes(24).toString("hex")}`;

  const bot = await prisma.user.create({
    data: {
      email,
      username,
      displayName,
      isBot: true,
      botToken,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      botToken: true,
      createdAt: true,
    },
  });

  res.status(201).json({
    ok: true,
    bot: {
      id: bot.id,
      username: bot.username,
      display_name: bot.displayName,
      bot_token: bot.botToken,
      created_at: bot.createdAt,
    },
    message: "Save the bot_token — it won't be shown again",
  });
});

// POST /api/bots/register — Vincula o webhook_url ao bot (requer bot_token)
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
  }

  const { bot_token, webhook_url } = parsed.data;

  const bot = await prisma.user.findUnique({
    where: { botToken: bot_token },
    select: { id: true, username: true, displayName: true },
  });

  if (!bot) {
    return res.status(401).json({ error: "Invalid bot_token" });
  }

  await prisma.user.update({
    where: { id: bot.id },
    data: { webhookUrl: webhook_url },
  });

  console.log(`[bots] Bot "${bot.username}" (${bot.id}) registered webhook: ${webhook_url}`);

  res.json({
    ok: true,
    bot: {
      id: bot.id,
      username: bot.username,
      display_name: bot.displayName,
      webhook_url: webhook_url,
    },
  });
});

export default router;
