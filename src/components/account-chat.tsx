"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Lock, Plus, Send, Sparkles, User, X } from "lucide-react";
import { ingestAccountDataAction } from "@/lib/actions";
import { BrainIcon } from "@/components/brain-ui";

type Attachment = { id: string; name: string; url: string };
type ChatTurn = { role: "user" | "assistant"; content: string; images?: string[] };

export function AccountChat({
  scope,
  header,
  placeholder,
  emptyDescription,
  suggestions,
  showBrain,
  onBrainOpen,
  composerLeading,
  composerPrefix,
  allowUploads = true,
  accountLabel,
  onScopeRevert,
  locked = false,
}: {
  /** "all" for the portfolio, or a dealId for a single account. Drives history + posting. */
  scope: string;
  /** Fixed content rendered at the top of the chat box (selector + carousel). */
  header?: ReactNode;
  placeholder: string;
  emptyDescription: string;
  suggestions: string[];
  showBrain: boolean;
  onBrainOpen?: () => void;
  /** Optional control rendered inside the prompt field (e.g. the account selector chip). */
  composerLeading?: ReactNode;
  /** Faint text shown before composerLeading while the prompt is empty (e.g. "Ask Account-AI about"). */
  composerPrefix?: string;
  /** Whether the user may attach files (only for a specific account, not portfolio mode). */
  allowUploads?: boolean;
  /** Display name of the selected account, used in the ingest confirmation. */
  accountLabel?: string;
  /** Revert the active scope (used to cancel a switch that would drop uploads). */
  onScopeRevert?: (scope: string) => void;
  /** When true the selected account opted out of AI; chat + uploads are disabled. */
  locked?: boolean;
}) {
  const storageKey = `account-chat:${scope}`;
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // When the user sends a message with attached files, gate it behind a
  // confirmation so they choose whether the file is ingested into the
  // account's brain (persistent) or kept temporary for just this chat.
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  // Guards switching to a no-upload scope (e.g. "My Accounts") while files are
  // attached, since uploads must belong to a specific account's brain.
  const [scopeGuard, setScopeGuard] = useState<{ prevScope: string } | null>(null);
  const prevScopeRef = useRef(scope);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Load persisted history for this scope (client-only to avoid SSR mismatch).
  // Re-runs when the scope changes so switching accounts swaps the thread.
  useEffect(() => {
    let next: ChatTurn[] = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) next = JSON.parse(raw) as ChatTurn[];
    } catch {
      // ignore corrupt storage
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns(next);
    setError(null);
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

  // When the scope changes into a mode that can't hold uploads (e.g. "My
  // Accounts") while files are still attached, prompt before dropping them.
  useEffect(() => {
    if (prevScopeRef.current === scope) return;
    const prevScope = prevScopeRef.current;
    prevScopeRef.current = scope;
    if (!allowUploads && attachments.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScopeGuard({ prevScope });
    }
  }, [scope, allowUploads, attachments.length]);

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

  // Entry point from the composer: if files are attached, ask first.
  const requestSend = (text: string) => {
    if (locked || !text.trim() || loading) return;
    if (allowUploads && attachments.length > 0) {
      setPendingText(text);
      return;
    }
    void send(text);
  };

  // Resolve the confirmation: optionally ingest attachments into the brain,
  // then send the message either way.
  const resolvePendingSend = async (addToBrain: boolean) => {
    const text = pendingText;
    if (text === null) return;
    if (addToBrain) {
      setIngesting(true);
      try {
        await Promise.all(
          attachments.map((attachment) => {
            const fd = new FormData();
            fd.set("dealId", scope);
            fd.set("kind", "asset");
            fd.set("type", "WHITEBOARD");
            fd.set("sourceTool", "Account-AI chat upload");
            fd.set("title", attachment.name);
            fd.set("uri", attachment.url);
            fd.set("previewImageUri", attachment.url);
            return ingestAccountDataAction(fd);
          }),
        );
      } catch {
        // Non-fatal: still send the message even if ingestion fails.
      } finally {
        setIngesting(false);
      }
    }
    setPendingText(null);
    void send(text);
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
          scope,
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
    <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-charcoal-200 bg-white shadow-sm">
      {/* Account selector + meeting carousel, fixed at the top of the chat box */}
      {header ? <div className="shrink-0">{header}</div> : null}

      {/* Messages */}
      <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length > 0 ? (
          <button
            type="button"
            onClick={clearChat}
            className="sticky top-0 z-10 ml-auto block rounded-md border border-charcoal-200 bg-white/90 px-2 py-1 text-xs font-medium text-charcoal-600 shadow-sm backdrop-blur hover:bg-charcoal-50"
          >
            Clear chat
          </button>
        ) : null}
        {locked ? (
          <div className="mx-auto max-w-md py-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Lock className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-charcoal-800">
              {accountLabel ?? "This account"} has opted out of AI usage
            </p>
            <p className="mt-1 text-sm text-charcoal-500">
              Nutanix honors this account&apos;s AI opt-out, so Account-AI is disabled here and none of their data is
              sent to the model. Pick another account to keep working.
            </p>
          </div>
        ) : turns.length === 0 ? (
          <div className="mx-auto max-w-xl py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-iris-100 text-iris-600">
              <Bot className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm text-charcoal-500">{emptyDescription}</p>
            <div className="mt-4 flex flex-col gap-2">
              {suggestions.map((suggestion) => (
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
          {allowUploads && !locked ? (
            <>
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
            </>
          ) : null}

          {/* Unified prompt field: optional account chip + the textarea read as one field. */}
          <div className="flex min-h-[40px] flex-1 items-center gap-2 rounded-lg border border-charcoal-300 bg-white px-2.5 py-1.5 focus-within:border-iris-400">
            {composerLeading ? (
              <div className="flex shrink-0 items-center gap-1.5">
                {composerPrefix && !input ? (
                  <span className="hidden whitespace-nowrap text-sm font-medium text-iris-700 sm:inline">{composerPrefix}</span>
                ) : null}
                {composerLeading}
              </div>
            ) : null}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  requestSend(input);
                }
              }}
              rows={1}
              disabled={locked}
              placeholder={locked ? "Account-AI is disabled for this account" : placeholder}
              className="max-h-32 min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="button"
            onClick={() => requestSend(input)}
            disabled={locked || loading || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-iris-500 text-white transition hover:bg-iris-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>

          {showBrain ? (
            <button
              type="button"
              onClick={onBrainOpen}
              aria-label="Open Account-AI brain"
              title="View ingested knowledge base"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-iris-200 bg-white transition hover:bg-iris-50"
            >
              <BrainIcon size="sm" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Ingest-confirmation shown every time a message is sent with attachments. */}
      {pendingText !== null ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-charcoal-900/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-charcoal-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <BrainIcon size="md" />
              <div>
                <h3 className="text-sm font-semibold text-charcoal-900">
                  Heads up — this goes into {accountLabel ? `${accountLabel}'s` : "this account's"} brain
                </h3>
                <p className="mt-1 text-sm text-charcoal-600">
                  {`The ${attachments.length === 1 ? "file" : `${attachments.length} files`} you attached will be ingested into this account's Account-AI brain so it can use ${
                    attachments.length === 1 ? "it" : "them"
                  } in future chats. If you'd rather not, keep ${
                    attachments.length === 1 ? "it" : "them"
                  } temporary for just this conversation.`}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void resolvePendingSend(false)}
                disabled={ingesting}
                className="rounded-lg border border-charcoal-300 bg-white px-3.5 py-2 text-sm font-medium text-charcoal-700 transition hover:bg-charcoal-50 disabled:opacity-50"
              >
                Keep temporary for this chat
              </button>
              <button
                type="button"
                onClick={() => void resolvePendingSend(true)}
                disabled={ingesting}
                className="rounded-lg bg-iris-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-iris-600 disabled:opacity-50"
              >
                {ingesting ? "Adding…" : "Add to account brain"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Guard: switching to a scope that can't hold uploads while files attached. */}
      {scopeGuard !== null ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-charcoal-900/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-charcoal-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <BrainIcon size="md" />
              <div>
                <h3 className="text-sm font-semibold text-charcoal-900">Your upload will be removed</h3>
                <p className="mt-1 text-sm text-charcoal-600">
                  {`Uploads have to be assigned to a specific account so Account-AI knows which brain to put ${
                    attachments.length === 1 ? "it" : "them"
                  } in. The general "My Accounts" knowledge base can't hold ${
                    attachments.length === 1 ? "a file" : "files"
                  }, so switching will remove ${attachments.length === 1 ? "the file" : "the files"} you attached.`}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  const prev = scopeGuard.prevScope;
                  setScopeGuard(null);
                  onScopeRevert?.(prev);
                }}
                className="rounded-lg border border-charcoal-300 bg-white px-3.5 py-2 text-sm font-medium text-charcoal-700 transition hover:bg-charcoal-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachments([]);
                  setScopeGuard(null);
                }}
                className="rounded-lg bg-iris-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-iris-600"
              >
                Continue, remove uploads
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
