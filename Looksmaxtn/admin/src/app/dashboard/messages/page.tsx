"use client";

import { useEffect, useState } from "react";
import { withAuthRequest } from "@/lib/authClient";

interface Message {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

type AdminMessageRealtimeEvent =
  | { type: "message:upsert"; message: Message }
  | { type: "message:delete"; messageId: string };

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/messages", withAuthRequest())
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleMessageEvent = (event: Event) => {
      const detail = (event as CustomEvent<AdminMessageRealtimeEvent>).detail;
      if (!detail) return;

      if (detail.type === "message:delete") {
        setMessages((current) => current.filter((message) => message._id !== detail.messageId));
        return;
      }

      if (detail.type === "message:upsert") {
        setMessages((current) => {
          const exists = current.some((message) => message._id === detail.message._id);
          if (!exists) return [detail.message, ...current];
          return current.map((message) =>
            message._id === detail.message._id ? detail.message : message
          );
        });
      }
    };

    window.addEventListener("looksmax-admin-message-event", handleMessageEvent);
    return () => window.removeEventListener("looksmax-admin-message-event", handleMessageEvent);
  }, []);

  const toggleRead = async (msg: Message) => {
    const res = await fetch("/api/messages", withAuthRequest({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: msg._id, isRead: !msg.isRead }),
    }));
    if (res.ok) {
      setMessages((m) => m.map((x) => (x._id === msg._id ? { ...x, isRead: !x.isRead } : x)));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this message?")) return;
    const res = await fetch("/api/messages", withAuthRequest({
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }));
    if (res.ok) setMessages((m) => m.filter((x) => x._id !== id));
  };

  const unreadCount = messages.filter((m) => !m.isRead).length;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredMessages = normalizedSearch
    ? messages.filter((msg) =>
        [msg.name, msg.email, msg.subject, msg.message].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        )
      )
    : messages;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-wide">Messages</h1>
        <div className="flex flex-wrap items-center gap-3">
          {unreadCount > 0 && (
            <span className="text-xs text-warning bg-warning/10 px-3 py-1 rounded font-medium">
              {unreadCount} unread
            </span>
          )}
          <span className="text-xs text-text-secondary bg-bg-secondary px-3 py-1 rounded">
            {messages.length} total
          </span>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages by sender, email, subject, or content..."
          className="w-full bg-bg-secondary border border-border px-4 py-2.5 text-sm text-text-primary focus:border-accent transition-colors"
        />
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary animate-pulse">Loading...</p>
      ) : filteredMessages.length === 0 ? (
        <div className="border border-border border-dashed p-8 text-center rounded">
          <p className="text-sm text-text-secondary">
            {search ? "No messages match your search" : "No messages yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMessages.map((msg) => (
            <div
              key={msg._id}
              className={`border rounded transition-colors ${
                msg.isRead ? "border-border bg-bg-secondary/30" : "border-accent/30 bg-accent/5"
              }`}
            >
              <div
                className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpanded(expanded === msg._id ? null : msg._id)}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {!msg.isRead && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{msg.subject}</p>
                    <p className="text-[10px] text-text-secondary truncate">
                      {msg.name} · {msg.email}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-text-secondary shrink-0 ml-4">
                  {new Date(msg.createdAt).toLocaleDateString()}
                </span>
              </div>

              {expanded === msg._id && (
                <div className="px-4 pb-4 border-t border-border">
                  <p className="text-xs text-text-primary leading-relaxed mt-3 whitespace-pre-wrap">
                    {msg.message}
                  </p>
                  <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border">
                    <button
                      onClick={() => toggleRead(msg)}
                      className="text-[10px] text-info hover:text-info/80 transition-colors uppercase font-medium cursor-pointer"
                    >
                      Mark as {msg.isRead ? "Unread" : "Read"}
                    </button>
                    <button
                      onClick={() => handleDelete(msg._id)}
                      className="text-[10px] text-danger hover:text-danger/80 transition-colors uppercase font-medium cursor-pointer"
                    >
                      Delete
                    </button>
                    <a
                      href={`mailto:${msg.email}?subject=Re: ${msg.subject}`}
                      className="text-[10px] text-accent hover:text-accent/80 transition-colors uppercase font-medium"
                    >
                      Reply via Email
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
