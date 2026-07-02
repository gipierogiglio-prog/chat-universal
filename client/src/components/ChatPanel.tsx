import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { uploadFile } from "../api";
import { getSocket } from "../socket";
import type { Conversation, Message, User } from "../types";
import { conversationTitle, displayName, formatDate } from "../utils";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";

interface Props {
  me: User;
  conversation: Conversation | null;
  messages: Message[];
  hasMore: boolean;
  typingUserIds: string[];
  onLoadOlder: () => Promise<void>;
  onAppendMessage: (message: Message) => void;
  onBack: () => void;
}

export default function ChatPanel({
  me,
  conversation,
  messages,
  hasMore,
  typingUserIds,
  onLoadOlder,
  onAppendMessage,
  onBack,
}: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversation?.id]);

  if (!conversation) {
    return (
      <main className="chat-panel empty">
        <div className="empty-state">
          <div className="empty-emoji">💬</div>
          <p>Selecione uma conversa ou busque alguém para começar</p>
        </div>
      </main>
    );
  }

  const title = conversationTitle(conversation, me.id);
  const isGroup = conversation.type === "group";
  const subtitle = isGroup
    ? `${conversation.members.length} membros`
    : `@${conversation.members.find((m) => m.userId !== me.id)?.user.username ?? ""}`;

  const typingNames = typingUserIds
    .filter((id) => id !== me.id)
    .map((id) => {
      const member = conversation.members.find((m) => m.userId === id);
      return member ? displayName(member.user).split(" ")[0] : null;
    })
    .filter(Boolean);

  function sendViaSocket(payload: Record<string, unknown>) {
    return new Promise<void>((resolve, reject) => {
      const socket = getSocket();
      if (!socket) return reject(new Error("Sem conexão"));
      socket.emit(
        "message:send",
        { conversationId: conversation!.id, ...payload },
        (res: { ok: boolean; error?: string; message?: Message }) => {
          if (res.ok && res.message) {
            onAppendMessage(res.message);
            resolve();
          } else {
            reject(new Error(res.error ?? "Falha ao enviar"));
          }
        }
      );
    });
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await sendViaSocket({ type: "text", content });
      setText("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSending(false);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSending(true);
    setUploadError(null);
    try {
      const uploaded = await uploadFile(file);
      const isImage = uploaded.mimeType.startsWith("image/");
      await sendViaSocket({
        type: isImage ? "image" : "file",
        content: "",
        fileUrl: uploaded.url,
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setSending(false);
    }
  }

  function handleTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current > 1500) {
      lastTypingSent.current = now;
      getSocket()?.emit("typing", { conversationId: conversation!.id });
    }
  }

  // Group messages by day for date separators.
  const rows: Array<{ kind: "date"; label: string } | { kind: "msg"; message: Message; showSender: boolean }> = [];
  let lastDay = "";
  let lastSender: string | null | undefined;
  for (const message of messages) {
    const day = new Date(message.createdAt).toDateString();
    if (day !== lastDay) {
      rows.push({ kind: "date", label: formatDate(message.createdAt) });
      lastDay = day;
      lastSender = undefined;
    }
    rows.push({ kind: "msg", message, showSender: message.senderId !== lastSender });
    lastSender = message.senderId;
  }

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack}>
          ←
        </button>
        <Avatar name={title} seed={conversation.id} size={38} />
        <div className="chat-header-info">
          <strong>
            {isGroup && "👥 "}
            {title}
          </strong>
          <span>
            {typingNames.length > 0
              ? `${typingNames.join(", ")} digitando…`
              : subtitle}
          </span>
        </div>
      </header>

      <div className="messages" ref={scrollRef}>
        {hasMore && (
          <button className="btn-link load-older" onClick={() => onLoadOlder()}>
            Carregar mensagens anteriores
          </button>
        )}
        {rows.map((row, i) =>
          row.kind === "date" ? (
            <div key={`d${i}`} className="date-separator">
              <span>{row.label}</span>
            </div>
          ) : (
            <MessageBubble
              key={row.message.id}
              message={row.message}
              me={me}
              isGroup={isGroup}
              showSender={row.showSender}
            />
          )
        )}
      </div>

      {uploadError && (
        <div className="send-error" onClick={() => setUploadError(null)}>
          ⚠️ {uploadError}
        </div>
      )}

      <form className="composer" onSubmit={handleSend}>
        <input
          type="file"
          ref={fileInputRef}
          hidden
          onChange={handleFile}
        />
        <button
          type="button"
          className="icon-btn"
          title="Anexar arquivo ou imagem"
          disabled={sending}
          onClick={() => fileInputRef.current?.click()}
        >
          📎
        </button>
        <input
          className="composer-input"
          placeholder="Escreva uma mensagem…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleTyping();
          }}
          disabled={sending}
        />
        <button
          type="submit"
          className="icon-btn send-btn"
          disabled={sending || !text.trim()}
          title="Enviar"
        >
          ➤
        </button>
      </form>
    </main>
  );
}
