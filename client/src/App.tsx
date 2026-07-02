import { useAuth } from "./AuthContext";
import AuthPage from "./components/AuthPage";
import ChatApp from "./components/ChatApp";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="fullscreen-center">
        <div className="spinner" />
      </div>
    );
  }

  return user ? <ChatApp /> : <AuthPage />;
}
