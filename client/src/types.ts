export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  isBot: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  type: "text" | "image" | "file" | "system" | "notification";
  content: string;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  source: string;
  createdAt: string;
  sender: User | null;
}

export interface ConversationMember {
  conversationId: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: User;
}

export interface Conversation {
  id: string;
  type: "direct" | "group";
  name: string | null;
  createdAt: string;
  updatedAt: string;
  members: ConversationMember[];
  messages: Message[]; // last message only (from list endpoint)
}
