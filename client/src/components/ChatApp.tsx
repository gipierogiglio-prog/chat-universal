import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { connectSocket, disconnectSocket } from "../socket";
import type { Conversation, Message, User } from "../types";
import ChatPanel from "./ChatPanel";
import Sidebar from "./Sidebar";

export default function ChatApp() {
  const { user } = useAuth();
  const me = user!;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("chat_theme") as "dark" | "light") ?? "dark"
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("chat_theme", theme);
  }, [theme]);

  const refreshConversations = useCallback(async () => {
    const data = await api<{ conversations: Conversation[] }>("/api/conversations");
    setConversations(data.conversations);
  }, []);

  useEffect(() => {
    refreshConversations().catch(console.error);
    const socket = connectSocket();

    socket.on("message:new", (message: Message) => {
      if (message.conversationId === activeIdRef.current) {
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message]
        );
      }
      // Update last message + move the conversation to the top.
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === message.conversationId);
        if (idx === -1) {
          refreshConversations().catch(console.error);
          return prev;
        }
        const updated: Conversation = {
          ...prev[idx],
          messages: [message],
          updatedAt: message.createdAt,
        };
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    });

    socket.on("conversation:new", (conversation: Conversation) => {
      setConversations((prev) =>
        prev.some((c) => c.id === conversation.id)
          ? prev
          : [conversation, ...prev]
      );
    });

    socket.on("conversation:updated", (conversation: Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c))
      );
    });

    socket.on(
      "typing",
      ({ conversationId, userId }: { conversationId: string; userId: string }) => {
        if (conversationId !== activeIdRef.current) return;
        setTypingUsers((prev) => ({ ...prev, [userId]: Date.now() }));
      }
    );

    return () => {
      disconnectSocket();
    };
  }, [refreshConversations]);

  // Expire typing indicators after 3s without new events.
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const alive = Object.entries(prev).filter(([, t]) => now - t < 3000);
        return alive.length === Object.keys(prev).length
          ? prev
          : Object.fromEntries(alive);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const openConversation = useCallback(async (conversationId: string) => {
    setActiveId(conversationId);
    setMessages([]);
    setNextCursor(null);
    setTypingUsers({});
    setSidebarOpen(false);
    const data = await api<{ messages: Message[]; nextCursor: string | null }>(
      `/api/conversations/${conversationId}/messages`
    );
    setMessages(data.messages);
    setNextCursor(data.nextCursor);
  }, []);

  const loadOlder = useCallback(async () => {
    if (!activeId || !nextCursor) return;
    const data = await api<{ messages: Message[]; nextCursor: string | null }>(
      `/api/conversations/${activeId}/messages?cursor=${nextCursor}`
    );
    setMessages((prev) => [...data.messages, ...prev]);
    setNextCursor(data.nextCursor);
  }, [activeId, nextCursor]);

  const startDirect = useCallback(
    async (target: User) => {
      // Starting a chat also saves the user as a contact.
      api("/api/contacts", { method: "POST", body: { userId: target.id } }).catch(
        () => {}
      );
      const data = await api<{ conversation: Conversation }>("/api/conversations", {
        method: "POST",
        body: { type: "direct", userId: target.id },
      });
      setConversations((prev) =>
        prev.some((c) => c.id === data.conversation.id)
          ? prev
          : [data.conversation, ...prev]
      );
      await openConversation(data.conversation.id);
    },
    [openConversation]
  );

  const createGroup = useCallback(
    async (name: string, memberIds: string[]) => {
      const data = await api<{ conversation: Conversation }>("/api/conversations", {
        method: "POST",
        body: { type: "group", name, memberIds },
      });
      setConversations((prev) =>
        prev.some((c) => c.id === data.conversation.id)
          ? prev
          : [data.conversation, ...prev]
      );
      await openConversation(data.conversation.id);
    },
    [openConversation]
  );

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="chat-layout">
      <div className={`sidebar-wrapper ${sidebarOpen ? "open" : ""}`}>
        <Sidebar
          me={me}
          conversations={conversations}
          activeId={activeId}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          onOpenConversation={openConversation}
          onStartDirect={startDirect}
          onCreateGroup={createGroup}
        />
      </div>
      <ChatPanel
        me={me}
        conversation={active}
        messages={messages}
        hasMore={nextCursor !== null}
        typingUserIds={Object.keys(typingUsers)}
        onLoadOlder={loadOlder}
        onAppendMessage={(m) =>
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        }
        onBack={() => setSidebarOpen(true)}
      />
    </div>
  );
}
