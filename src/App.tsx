import { useEffect, useState } from "react";
import { ChatApp } from "./chat/ChatApp";
import { GreetDemo } from "./greet/GreetDemo";
import { DebugHud } from "./components/DebugHud";

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <>
      {hash === "#/greet" ? <GreetDemo /> : <ChatApp />}
      <DebugHud />
    </>
  );
}
