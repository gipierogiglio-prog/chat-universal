import type { Conversation, User } from "./types";

export function displayName(user: User | null): string {
  if (!user) return "Desconhecido";
  return user.displayName || user.username;
}

export function conversationTitle(conv: Conversation, meId: string): string {
  if (conv.type === "group") return conv.name ?? "Grupo";
  const other = conv.members.find((m) => m.userId !== meId);
  return other ? displayName(other.user) : "Notas pessoais";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const chars = parts.slice(0, 2).map((p) => p[0] ?? "");
  return chars.join("").toUpperCase() || "?";
}

const AVATAR_COLORS = [
  "#e17076", "#7bc862", "#65aadd", "#a695e7",
  "#ee7aae", "#6ec9cb", "#faa774", "#8e85ee",
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
