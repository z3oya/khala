import { useEffect, useState } from "react";
import { ChatApp } from "./chat/ChatApp";
import { AppStandalone } from "./chat/apps/AppStandalone";
import { GreetDemo } from "./greet/GreetDemo";
import { DebugHud } from "./components/DebugHud";

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const standaloneApp = hash.match(/^#\/app\/(.+)$/)?.[1];

  return (
    <>
      {standaloneApp ? (
        <AppStandalone appId={standaloneApp} />
      ) : hash === "#/greet" ? (
        <GreetDemo />
      ) : (
        <ChatApp />
      )}
      <DebugHud />
    </>
  );
}
