import { useEffect, useRef, useState } from "react";

const BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5001";

type Role = "user" | "assistant" | "error";

interface Message {
  id: string;
  role: Role;
  content: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Force light mode so it blends into Jupyter
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  const scrollToBottom = () => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const addMessage = (msg: Omit<Message, "id">) =>
    setMessages((prev) => [...prev, { ...msg, id: crypto.randomUUID() }]);

  const lastAiMessage = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? null;

  const fallbackCopy = (text: string) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch { /* ignore */ }
    document.body.removeChild(ta);
  };

  const handleCopy = () => {
    if (!lastAiMessage) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(lastAiMessage).catch(() => fallbackCopy(lastAiMessage));
    } else {
      fallbackCopy(lastAiMessage);
    }
    // Also post to parent for Jupyter iframe context
    window.parent.postMessage({ type: "cortex-copy", text: lastAiMessage }, "*");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendText = async (text: string) => {
    addMessage({ role: "user", content: text });
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      addMessage({ role: "assistant", content: data.response });
    } catch (e) {
      addMessage({ role: "error", content: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading || !input.trim()) return;
    await sendText(input.trim());
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex flex-col h-screen bg-white text-slate-800">
      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role !== "user" && (
                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[10px] font-bold flex-shrink-0 mr-2 mt-0.5">
                  AI
                </div>
              )}
              <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-slate-100 text-slate-800 rounded-br-sm"
                  : msg.role === "error"
                  ? "bg-red-50 text-red-600 border border-red-200 font-mono"
                  : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm"
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[10px] font-bold flex-shrink-0 mr-2 mt-0.5">
                AI
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Input */}
      <div className="bg-white px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-3xl mx-auto">
          {/* Copy last AI response */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!lastAiMessage}
            title="Copy last AI response"
            className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${
              copied
                ? "border-emerald-300 text-emerald-500"
                : "border-slate-100 text-slate-200 hover:border-slate-300 hover:text-slate-400 disabled:opacity-20 disabled:cursor-not-allowed"
            }`}
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
              </svg>
            )}
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder=""
            rows={1}
            className="flex-1 bg-white border-0 text-slate-400 rounded-xl px-4 py-2.5 text-sm outline-none focus:outline-none resize-none"
            style={{ minHeight: "40px" }}
          />
        </form>
      </div>
    </div>
  );
}
