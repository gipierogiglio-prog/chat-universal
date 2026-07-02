import { useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(identifier, password);
      } else {
        await register(email, username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fullscreen-center auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-logo">💬</div>
        <h1>Chat Universal</h1>
        <p className="auth-subtitle">
          {mode === "login"
            ? "Entre com email/usuário e senha"
            : "Crie sua conta — sem número de celular"}
        </p>

        {mode === "login" ? (
          <input
            placeholder="Email ou nome de usuário"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
        ) : (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <input
              placeholder="Nome de usuário (a-z, 0-9, _)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-zA-Z0-9_]{3,32}"
              title="3 a 32 caracteres: letras, números e underscore"
              autoComplete="username"
              required
            />
          </>
        )}
        <input
          type="password"
          placeholder={mode === "register" ? "Senha (mín. 8 caracteres)" : "Senha"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "..." : mode === "login" ? "Entrar" : "Criar conta"}
        </button>

        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login"
            ? "Não tem conta? Cadastre-se"
            : "Já tem conta? Entrar"}
        </button>
      </form>
    </div>
  );
}
