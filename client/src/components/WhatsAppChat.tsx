import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Mic,
  MicOff,
  Sparkles,
  CheckCheck,
  FileText,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { Quotation, Invoice, AgentToolTrace } from "@shared/types";

interface ChatMessage {
  id: string;
  sender: "user" | "agent" | "system";
  text: string;
  timestamp: string;
  attachment?: {
    type: "quotation" | "invoice";
    data: any;
  };
}

interface WhatsAppChatProps {
  onViewDocument: (doc: { type: "quotation"; data: Quotation } | { type: "invoice"; data: Invoice }) => void;
  quotations: Quotation[];
  invoices: Invoice[];
  traces: AgentToolTrace[];
  refreshState: () => void;
}

export const WhatsAppChat: React.FC<WhatsAppChatProps> = ({
  onViewDocument,
  quotations,
  invoices,
  traces: _traces,
  refreshState,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m-init",
      sender: "agent",
      text: "Namaste! Welcome to Cosmosys Wholesale Depot. I can help with wholesale rates, stock availability, and instant quotations for Cement, Electricals, Pipes, Paints, and Rebar (Saria). What do you need today?",
      timestamp: "10:00 AM",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      sender: "user",
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      });

      if (!res.ok) {
        throw new Error(`Edge error: ${res.statusText}`);
      }

      const data = (await res.json()) as {
        text?: string;
        quotations?: Quotation[];
        invoices?: Invoice[];
        status?: string;
      };

      // Check if new quotation or invoice was generated
      const latestQuote = data.quotations?.[0];
      const latestInvoice = data.invoices?.[0];

      let attachment: ChatMessage["attachment"] | undefined = undefined;
      if (latestInvoice && (!invoices.length || latestInvoice.id !== invoices[0]?.id)) {
        attachment = { type: "invoice", data: latestInvoice };
      } else if (latestQuote && (!quotations.length || latestQuote.id !== quotations[0]?.id)) {
        attachment = { type: "quotation", data: latestQuote };
      }

      const agentMsg: ChatMessage = {
        id: "a-" + Date.now(),
        sender: "agent",
        text: data.text || "Processed your request.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        attachment,
      };

      setMessages((prev) => [...prev, agentMsg]);
      refreshState();
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          sender: "system",
          text: `⚠️ Edge Error: ${err.message || "Failed to reach Durable Object agent"}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Voice recording using Web Speech API
  const toggleRecording = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Speech recognition is not supported in this browser. Please use Google Chrome or Edge.");
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    setIsRecording(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const resetSession = async () => {
    if (!confirm("Reset the agent session and conversation transcript?")) return;
    try {
      await fetch("/api/reset", { method: "POST" });
      setMessages([
        {
          id: "m-reset",
          sender: "system",
          text: "🔄 Durable Object session reset. Started a fresh conversation.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      refreshState();
    } catch (e) {
      console.error(e);
    }
  };

  const samplePrompts = [
    { label: "50 bags 53 grade cement", text: "I need 50 bags of 53 grade cement delivered to my site" },
    { label: "10 coils wire (discount request)", text: "Need 10 coils of Finolex 2.5 wire, but list price is high, can you do 1900 per coil?" },
    { label: "Invoice confirmation", text: "Haan done chalega, confirm and invoice bana do" },
    { label: "Learn nickname", text: "Hum log Tata Tiscon saria ko 'tata rod' bolte hai, yaad rakhna" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto border-x border-slate-800 bg-slate-950 shadow-2xl relative">
      {/* WhatsApp Chat Header */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex items-center justify-between z-10 backdrop-blur">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-white shadow">
              CQ
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-slate-900 rounded-full"></span>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h2 className="font-semibold text-white text-sm">Cosmosys QuoteFlow</h2>
              <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-medium border border-emerald-500/30">
                Verified Merchant
              </span>
            </div>
            <p className="text-xs text-emerald-400">Online • Workers AI Llama 3.3</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={resetSession}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Reset Session"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Suggested Scenario Prompts */}
      <div className="bg-slate-900/40 px-4 py-2 border-b border-slate-800/80 flex items-center space-x-2 overflow-x-auto text-xs no-scrollbar">
        <span className="text-slate-400 flex items-center gap-1 font-medium whitespace-nowrap">
          <Sparkles className="w-3.5 h-3.5 text-orange-400" />
          Scenarios:
        </span>
        {samplePrompts.map((p, i) => (
          <button
            key={i}
            onClick={() => handleSend(p.text)}
            disabled={loading}
            className="px-2.5 py-1 rounded-full bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 whitespace-nowrap transition"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
        {messages.map((m) => {
          if (m.sender === "system") {
            return (
              <div key={m.id} className="flex justify-center my-2">
                <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 text-slate-400 text-xs border border-slate-700/60 max-w-md text-center">
                  {m.text}
                </div>
              </div>
            );
          }

          const isUser = m.sender === "user";

          return (
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 shadow-md relative ${
                  isUser
                    ? "bg-emerald-700/90 text-white rounded-tr-none border border-emerald-600/40"
                    : "bg-slate-900 text-slate-100 rounded-tl-none border border-slate-800"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>

                {/* Inline Quotation Card Attachment */}
                {m.attachment?.type === "quotation" && (
                  <div className="mt-3 bg-slate-950/70 border border-emerald-500/30 rounded-xl p-3 text-xs space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5" />
                        Quotation #{m.attachment.data.quoteNumber}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          m.attachment.data.status === "APPROVED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        }`}
                      >
                        {m.attachment.data.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {m.attachment.data.items.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-slate-300">
                          <span>
                            {it.name} (x{it.quantity} {it.unit})
                          </span>
                          <span className="font-medium text-white">₹{it.totalPrice}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between pt-1 border-t border-slate-800 font-bold text-white">
                      <span>Total (incl. GST):</span>
                      <span className="text-emerald-400 text-sm">₹{m.attachment.data.total}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => onViewDocument({ type: "quotation", data: m.attachment?.data })}
                        className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 font-medium"
                      >
                        <ExternalLink className="w-3 h-3" /> View Formal Quote
                      </button>
                      {m.attachment.data.status === "APPROVED" && (
                        <button
                          onClick={() => handleSend("Haan theek hai, invoice bana do")}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded text-[11px] transition shadow"
                        >
                          Confirm & Issue Invoice
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Inline Invoice Card Attachment */}
                {m.attachment?.type === "invoice" && (
                  <div className="mt-3 bg-slate-950/70 border border-indigo-500/30 rounded-xl p-3 text-xs space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="font-bold text-indigo-400 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        Tax Invoice #{m.attachment.data.invoiceNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        {m.attachment.data.status}
                      </span>
                    </div>

                    <p className="text-slate-300">
                      Amount Due: <strong className="text-white text-sm">₹{m.attachment.data.total}</strong>
                    </p>
                    <p className="text-[11px] text-slate-400">Terms: {m.attachment.data.paymentTerms}</p>

                    <button
                      onClick={() => onViewDocument({ type: "invoice", data: m.attachment?.data })}
                      className="w-full mt-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-xs flex items-center justify-center gap-1.5 transition shadow"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Official Tax Invoice
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-end space-x-1 mt-1 text-[10px] text-slate-300/80">
                  <span>{m.timestamp}</span>
                  {isUser && <CheckCheck className="w-3.5 h-3.5 text-sky-300" />}
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-3.5 text-xs text-slate-400 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>Reasoning & executing tools with Workers AI Llama 3.3...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 z-10 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center space-x-2"
        >
          {/* Voice Input Toggle Button */}
          <button
            type="button"
            onClick={toggleRecording}
            className={`p-2.5 rounded-xl transition ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
            }`}
            title={isRecording ? "Listening... click to stop" : "Speak via Microphone (Voice Input)"}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRecording ? "Listening to your voice..." : "Type in English or Hinglish (e.g. 50 bags 53 grade cement)..."}
            disabled={loading}
            className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl transition shadow-md shadow-emerald-900/30"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
