"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Brain, Plus, Send, Sparkles, User, X } from "lucide-react";
import { AccountBrainPanel } from "@/components/account-brain-panel";
import type { BrainSummary } from "@/lib/account-ai";

type Attachment = { id: string; name: string; url: string };
type ChatTurn = { role: "user" | "assistant"; content: string; images?: string[] };

const SUGGESTIONS = [
  "Summarize where this deal stands and the top technical risks.",
  "Draft discovery questions for our next meeting.",
  "What objections should I prepare for, and how do I counter them?",
];

export function AccountChat({
  dealId,
  accountName,
  summary,
}: {
  dealId: string;
  accountName: string;
  summary: BrainSummary;
}) {
  const storageKey = `account-chat:${dealId}`;
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brainOpen, setBrainOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Load persisted history for this account (client-only to avoid SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setTurns(JSON.parse(raw) as ChatTurn[]);
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(turns));
    } catch {
      // ignore quota errors
    }
  }, [turns, hydrated, storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 8)
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            { id: `${file.name}-${Date.now()}-${Math.random()}`, name: file.name, url: String(reader.result) },
          ]);
        };
        reader.readAsDataURL(file);
      });
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);

    const images = attachments.map((a) => a.url);
    const attachmentNames = attachments.map((a) => a.name);
    const nextTurns: ChatTurn[] = [...turns, { role: "user", content, images: images.length ? images : undefined }];
    setTurns(nextTurns);
    setInput("");
    setAttachments([]);
    setLoading(true);

    try {
      const res = await fetch("/api/account-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          messages: nextTurns.map((turn) => ({ role: turn.role, content: turn.content })),
          attachments: attachmentNames,
        }),
      });
      const data = (await res.json()) as { ok: boolean; reply?: string; error?: string };
      if (data.ok && data.reply) {
        setTurns((prev) => [...prev, { role: "assistant", content: data.reply as string }]);
      } else {
        setError(data.error ?? "Account-AI could not respond.");
      }
    } catch {
      setError("Network error reaching Account-AI.");
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setTurns([]);
    setError(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-charcoal-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-charcoal-200 bg-gradient-to-r from-iris-50 to-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-iris-500 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-charcoal-900">Account-AI · {accountName}</h2>
            <p className="text-xs text-charcoal-500">Seasoned Nutanix SE trained on this account&apos;s knowledge base.</p>
          </div>
        </div>
        {turns.length > 0 ? (
          <button
            type="button"
            onClick={clearChat}
            className="rounded-md border border-charcoal-200 bg-white px-2 py-1 text-xs font-medium text-charcoal-600 hover:bg-charcoal-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 ? (
          <div className="mx-auto max-w-xl py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-iris-100 text-iris-600">
              <Bot className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-charcoal-800">
              Ask Account-AI anything about {accountName}.
            </p>
            <p className="mt-1 text-sm text-charcoal-500">
              It knows {summary.meetingCount} meetings, {summary.noteCount} notes, and {summary.assetCount} documents for
              this account only.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="rounded-lg border border-charcoal-200 bg-white px-3 py-2 text-left text-sm text-charcoal-700 transition hover:border-iris-300 hover:bg-iris-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, index) => (
            <div
              key={index}
              className={`flex items-start gap-2.5 ${turn.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  turn.role === "user" ? "bg-charcoal-200 text-charcoal-700" : "bg-iris-500 text-white"
                }`}
              >
                {turn.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </span>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  turn.role === "user"
                    ? "rounded-tr-sm bg-iris-500 text-white"
                    : "rounded-tl-sm bg-charcoal-50 text-charcoal-800"
                }`}
              >
                {turn.images && turn.images.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {turn.images.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="attachment" className="h-16 w-16 rounded-md border border-white/30 object-cover" />
                    ))}
                  </div>
                ) : null}
                <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
              </div>
            </div>
          ))
        )}

        {loading ? (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-iris-500 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="rounded-2xl rounded-tl-sm bg-charcoal-50 px-3.5 py-2.5">
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-charcoal-400 [animation-delay:-0.2s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-charcoal-400 [animation-delay:-0.1s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-charcoal-400" />
              </span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-charcoal-200 p-3">
        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <span key={attachment.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.name} className="h-12 w-12 rounded-md border border-charcoal-200 object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))}
                  aria-label={`Remove ${attachment.name}`}
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-charcoal-700 text-white"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onPickImages(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add image"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-charcoal-200 bg-white text-charcoal-600 transition hover:bg-iris-50 hover:text-iris-700"
          >
            <Plus className="h-5 w-5" />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={`Ask Account-AI about ${accountName}…`}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-iris-500 text-white transition hover:bg-iris-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setBrainOpen(true)}
            aria-label="Open Account-AI brain"
            title="View ingested knowledge base"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-iris-200 bg-iris-50 text-iris-600 transition hover:bg-iris-100"
          >
            <Brain className="h-5 w-5" />
          </button>
        </div>
      </div>

      <AccountBrainPanel open={brainOpen} onClose={() => setBrainOpen(false)} summary={summary} dealId={dealId} />
    </div>
  );
}
