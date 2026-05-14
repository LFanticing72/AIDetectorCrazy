import { useEffect, useRef, useState } from "react";

const BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5001";

type Role = "user" | "assistant" | "error";

interface Message {
  id: string;
  role: Role;
  content: string;
  imagePreview?: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const addMessage = (msg: Omit<Message, "id">) =>
    setMessages((prev) => [...prev, { ...msg, id: crypto.randomUUID() }]);

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

  const sendImage = async (file: File, caption: string) => {
    const preview = URL.createObjectURL(file);
    addMessage({ role: "user", content: caption || "Image uploaded for OCR", imagePreview: preview });
    setLoading(true);

    const form = new FormData();
    form.append("image", file);

    try {
      const res = await fetch(`${BASE}/upload-image`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      addMessage({ role: "assistant", content: data.cleaned_text ?? data.raw_text ?? "No text extracted." });
    } catch (e) {
      addMessage({ role: "error", content: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setLoading(false);
      setPendingImage(null);
      setPendingPreview(null);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    if (pendingImage) {
      await sendImage(pendingImage, input.trim());
    } else if (input.trim()) {
      await sendText(input.trim());
    }
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImage(file);
    setPendingPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  const clearImage = () => {
    setPendingImage(null);
    setPendingPreview(null);
  };

  return (
    <div className="flex flex-col h-screen dark:bg-mri-900 bg-slate-100 transition-colors">
      {/* Header */}
      <header className="flex-shrink-0 border-b dark:border-mri-border border-slate-200 dark:bg-mri-800 bg-white px-6 py-3 flex items-center gap-3">
        <div>
          <h1
            className="font-black text-xl leading-tight dark:text-slate-100 text-slate-900"
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            CORTEX <span className="text-cyan-400">AI</span>
          </h1>
          <p className="text-[10px] font-mono dark:text-slate-600 text-slate-400 uppercase tracking-widest leading-tight">
            Chat Interface
          </p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center mt-24 space-y-3">
              <p
                className="text-4xl font-black dark:text-slate-800 text-slate-200 select-none"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                CORTEX <span className="text-cyan-400/40">AI</span>
              </p>
              <p className="text-xs font-mono dark:text-slate-600 text-slate-400 uppercase tracking-widest">
                Type a message or attach an image
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role !== "user" && (
                <div className="w-7 h-7 rounded-full bg-cyan-600 dark:bg-cyan-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mr-2 mt-0.5">
                  AI
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "dark:bg-cyan-700 bg-cyan-600 text-white rounded-br-sm"
                    : msg.role === "error"
                    ? "dark:bg-red-950/40 dark:text-red-400 dark:border dark:border-red-900/50 bg-red-50 text-red-700 border border-red-200 font-mono"
                    : "dark:bg-mri-800 dark:border dark:border-mri-border dark:text-slate-200 bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                }`}
              >
                {msg.imagePreview && (
                  <img
                    src={msg.imagePreview}
                    alt="Uploaded"
                    className="max-h-52 rounded-xl mb-2 object-contain"
                  />
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-cyan-600 dark:bg-cyan-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mr-2 mt-0.5">
                AI
              </div>
              <div className="dark:bg-mri-800 dark:border dark:border-mri-border bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3.5">
                <div className="flex items-center gap-1.5">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full dark:bg-slate-500 bg-slate-300 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t dark:border-mri-border border-slate-200 dark:bg-mri-800 bg-white px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Image preview */}
          {pendingPreview && (
            <div className="flex items-center gap-3 px-1">
              <div className="relative">
                <img
                  src={pendingPreview}
                  alt="Preview"
                  className="h-14 rounded-lg object-cover border dark:border-mri-border border-slate-200"
                />
                <button
                  onClick={clearImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full dark:bg-mri-700 bg-slate-200 dark:text-slate-300 text-slate-600 text-xs flex items-center justify-center hover:dark:bg-red-900 hover:bg-red-100 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </div>
              <span className="text-xs font-mono dark:text-slate-500 text-slate-400 truncate">
                {pendingImage?.name}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            {/* Image attach */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Attach image"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border dark:border-mri-border dark:text-slate-500 dark:hover:border-cyan-700 dark:hover:text-cyan-400 border-slate-300 text-slate-400 hover:border-cyan-500 hover:text-cyan-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            {/* Text input */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={pendingImage ? "Add a caption (optional)..." : "Send a message... (Shift+Enter for new line)"}
              rows={1}
              className="flex-1 dark:bg-mri-700 dark:border-mri-border dark:text-slate-200 dark:placeholder-slate-600 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-cyan-500 dark:focus:border-cyan-600 resize-none transition-colors"
              style={{ minHeight: "40px" }}
            />

            {/* Send */}
            <button
              type="submit"
              disabled={loading || (!input.trim() && !pendingImage)}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-cyan-600 hover:bg-cyan-500 dark:bg-cyan-700 dark:hover:bg-cyan-600 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
