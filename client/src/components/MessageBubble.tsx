import type { Message, User } from "../types";
import { avatarColor, displayName, formatFileSize, formatTime } from "../utils";

interface Props {
  message: Message;
  me: User;
  isGroup: boolean;
  showSender: boolean;
}

export default function MessageBubble({ message, me, isGroup, showSender }: Props) {
  const mine = message.senderId === me.id;
  const senderLabel = displayName(message.sender);

  return (
    <div className={`bubble-row ${mine ? "mine" : ""}`}>
      <div className={`bubble ${mine ? "mine" : ""} ${message.type === "notification" ? "notification" : ""}`}>
        {!mine && isGroup && showSender && (
          <div
            className="bubble-sender"
            style={{ color: avatarColor(message.senderId ?? "?") }}
          >
            {senderLabel}
            {message.sender?.isBot && <span className="bot-badge">bot</span>}
          </div>
        )}

        {message.type === "image" && message.fileUrl && (
          <a href={message.fileUrl} target="_blank" rel="noreferrer">
            <img
              className="bubble-image"
              src={message.fileUrl}
              alt={message.fileName ?? "imagem"}
              loading="lazy"
            />
          </a>
        )}

        {message.type === "file" && message.fileUrl && (
          <a className="bubble-file" href={message.fileUrl} download={message.fileName ?? true}>
            <span className="bubble-file-icon">📎</span>
            <span>
              <strong>{message.fileName ?? "Arquivo"}</strong>
              <small>{formatFileSize(message.fileSize)}</small>
            </span>
          </a>
        )}

        {message.type === "notification" && (
          <div className="bubble-notification-tag">🔔 Notificação</div>
        )}

        {message.content && <div className="bubble-text">{message.content}</div>}

        <div className="bubble-time">{formatTime(message.createdAt)}</div>
      </div>
    </div>
  );
}
