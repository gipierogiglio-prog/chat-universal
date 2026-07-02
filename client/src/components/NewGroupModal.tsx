import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { User } from "../types";
import { displayName } from "../utils";
import Avatar from "./Avatar";

interface Props {
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => Promise<void>;
}

export default function NewGroupModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      api<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((data) => setResults(data.users))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [query]);

  function toggle(user: User) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    );
  }

  async function handleCreate() {
    if (!name.trim() || selected.length === 0) {
      setError("Dê um nome ao grupo e selecione pelo menos 1 membro.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), selected.map((u) => u.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar grupo");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Novo grupo</h2>
        <input
          placeholder="Nome do grupo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          placeholder="Buscar membros por email ou usuário…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {selected.length > 0 && (
          <div className="chip-row">
            {selected.map((u) => (
              <button key={u.id} className="chip" onClick={() => toggle(u)}>
                {displayName(u)} ✕
              </button>
            ))}
          </div>
        )}

        <div className="modal-results">
          {results.map((u) => {
            const isSelected = selected.some((s) => s.id === u.id);
            return (
              <button
                key={u.id}
                className={`conv-item ${isSelected ? "active" : ""}`}
                onClick={() => toggle(u)}
              >
                <Avatar name={displayName(u)} seed={u.id} size={34} />
                <div className="conv-info">
                  <div className="conv-title">{displayName(u)}</div>
                  <div className="conv-preview">@{u.username}</div>
                </div>
                <span>{isSelected ? "✓" : "+"}</span>
              </button>
            );
          })}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-link" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleCreate} disabled={busy}>
            {busy ? "..." : "Criar grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}
