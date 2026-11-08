export type Transport = "tauri" | "http";

export class RpcError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

export function transport(): Transport {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? "tauri"
    : "http";
}

export async function call<Args extends object, Out>(
  command: string,
  args: Args = {} as Args,
): Promise<Out> {
  if (transport() === "tauri") {
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      return await invoke<Out>(command, { args });
    } catch (raw) {
      throw toRpcError(raw);
    }
  }

  let res: Response;
  try {
    res = await fetch(`/api/rpc/${command}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch (cause) {
    throw new RpcError("network", `cannot reach khala-server: ${String(cause)}`);
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw data === null
      ? new RpcError("network", `khala-server unreachable (HTTP ${res.status})`)
      : toRpcError(data);
  }
  return data as Out;
}

function toRpcError(raw: unknown): RpcError {
  if (raw && typeof raw === "object" && typeof (raw as { code?: unknown }).code === "string") {
    const { code, message } = raw as { code: string; message?: unknown };
    return new RpcError(code, typeof message === "string" ? message : code);
  }
  if (raw instanceof Error) {
    return new RpcError("unknown", raw.message);
  }
  if (typeof raw === "string" && raw.length > 0) {
    return new RpcError("unknown", raw);
  }
  return new RpcError("unknown", "unexpected empty error");
}
