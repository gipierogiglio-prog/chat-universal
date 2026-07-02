import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import type { Conversation, User } from "../types";
import { conversationTitle, displayName, formatTime } from "../utils";
import Avatar from "./Avatar";
import NewGroupModal from "./NewGroupModal";

interface Props {
  me: User;
  conversations: Conversation[];
  activeId: string | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenConversation: (id: string) => void;
  onStartDirect: (user: User) => void;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
}

export default function Sidebar({
  me,
  conversations,
  activeId,
  theme,
  onToggleTheme,
  onOpenConversation,
  onStartDirect,
  onCreateGroup,
}: Props) {
  const { logout } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      api<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((data) => setResults(data.users))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  function lastMessagePreview(conv: Conversation): string {
    const last = conv.messages[0];
    if (!last) return "Sem mensagens";
    const prefix =
      conv.type === "group" && last.sender
        ? `${displayName(last.sender).split(" ")[0]}: `
        : "";
    if (last.type === "image") return `${prefix}📷 Imagem`;
    if (last.type === "file") return `${prefix}📎 ${last.fileName ?? "Arquivo"}`;
    return prefix + last.content;
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <Avatar name={displayName(me)} seed={me.id} size={38} />
        <div className="sidebar-me">
          <strong>{displayName(me)}</strong>
          <span>@{me.username}</span>
        </div>
        <button
          className="icon-btn"
          title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button className="icon-btn" title="Sair" onClick={logout}>
          ⎋
        </button>
      </header>

      <div className="sidebar-search">
        <input
          placeholder="Buscar por email ou usuário…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="icon-btn"
          title="Novo grupo"
          onClick={() => setShowGroupModal(true)}
        >
          👥+
        </button>
      </div>

      {results.length > 0 && (
        <div className="search-results">
          <div className="search-results-label">Usuários</div>
          {results.map((u) => (
            <button
              key={u.id}
              className="conv-item"
              onClick={() => {
                onStartDirect(u);
                setQuery("");
              }}
            >
              <Avatar name={displayName(u)} seed={u.id} />
              <div className="conv-info">
                <div className="conv-title">
                  {displayName(u)} {u.isBot && <span className="bot-badge">bot</span>}
                </div>
                <div className="conv-preview">@{u.username} · {u.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <nav className="conv-list">
        {conversations.length === 0 && (
          <div className="empty-hint">
            Nenhuma conversa ainda.
            <br />
            Busque alguém acima para começar!
          </div>
        )}
        {conversations.map((conv) => {
          const title = conversationTitle(conv, me.id);
          const last = conv.messages[0];
          return (
            <button
              key={conv.id}
              className={`conv-item ${conv.id === activeId ? "active" : ""}`}
              onClick={() => onOpenConversation(conv.id)}
            >
              <Avatar
                name={conv.type === "group" ? `👥 ${title}` : title}
                seed={conv.id}
              />
              <div className="conv-info">
                <div className="conv-row">
                  <div className="conv-title">
                    {conv.type === "group" && "👥 "}
                    {title}
                  </div>
                  {last && <div className="conv-time">{formatTime(last.createdAt)}</div>}
                </div>
                <div className="conv-preview">{lastMessagePreview(conv)}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {showGroupModal && (
        <NewGroupModal
          onClose={() => setShowGroupModal(false)}
          onCreate={async (name, ids) => {
            await onCreateGroup(name, ids);
            setShowGroupModal(false);
          }}
        />
      )}
    </aside>
  );
}
