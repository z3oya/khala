/* #/greet demo; docs/e2e.md targets these testids. */
import { CircleAlert, History, Inbox, Send, Trash2 } from "lucide-react";
import { useGreet } from "./useGreet";
import "../App.css";

export function GreetDemo() {
  const { name, setName, greeting, history, error, busy, submit, reset } = useGreet();

  return (
    <main className="container">
      <h1 data-testid="app-title">khala</h1>

      <form className="greet-form" data-testid="greet-form" onSubmit={submit}>
        <input
          data-testid="greet-input"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name…"
          autoComplete="off"
          autoFocus
        />
        <button data-testid="greet-submit" type="submit" disabled={busy}>
          <Send size={16} aria-hidden />
          Greet
        </button>
      </form>

      {error && (
        <p className="error" data-testid="app-error" role="alert">
          <CircleAlert size={16} aria-hidden />
          <span>{error}</span>
        </p>
      )}
      {greeting && !error && (
        <p className="result" data-testid="greet-result">
          {greeting}
        </p>
      )}

      <section className="history" data-testid="greet-history">
        <header>
          <h2>
            <History size={16} aria-hidden />
            History
          </h2>
          {history.length > 0 && (
            <button data-testid="reset-button" onClick={() => void reset()}>
              <Trash2 size={14} aria-hidden />
              Clear
            </button>
          )}
        </header>
        {history.length === 0 ? (
          <p className="empty" data-testid="greet-history-empty">
            <Inbox size={16} aria-hidden />
            No greetings yet.
          </p>
        ) : (
          <ul>
            {history.map((r, i) => (
              <li key={`${r.atMs}-${i}`} data-testid="greet-history-item">
                <span className="idx">{history.length - i}</span>
                <span className="who">{r.name}</span>
                <span className="when">{new Date(r.atMs).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
