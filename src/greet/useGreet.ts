/* Shared greet state for the #/greet demo and the Settings greeting panel. */
import { useCallback, useState, type FormEvent } from "react";
import { api, type GreetRecord } from "../api/commands";
import { RpcError } from "../lib/rpc";

export function useGreet() {
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState<string | null>(null);
  const [history, setHistory] = useState<GreetRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const describe = (err: unknown) =>
    err instanceof RpcError ? `${err.code}: ${err.message}` : String(err);

  const send = useCallback(async (who: string) => {
    setError(null);
    setBusy(true);
    try {
      const out = await api.greet(who);
      setGreeting(out.greeting);
      setHistory(out.history);
      setName("");
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void send(name);
    },
    [name, send],
  );

  const reset = useCallback(async () => {
    setError(null);
    try {
      const out = await api.reset();
      setHistory(out.history);
      setGreeting(null);
    } catch (err) {
      setError(describe(err));
    }
  }, []);

  return { name, setName, greeting, history, error, busy, submit, send, reset };
}
