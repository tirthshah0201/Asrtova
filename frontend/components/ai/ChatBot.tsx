"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { api } from "@/services/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Sparkles,
  Send,
  Globe,
  Trash2,
  Loader2,
  ChevronDown,
  MessageSquare,
  MapPin,
  Landmark,
  Clock,
  Palette,
  Bookmark,
} from "lucide-react";

/* ---- Types ---- */

interface Language {
  code: string;
  name: string;
  nativeName: string;
}

interface HeritageCard {
  id: string;
  name: string;
  slug: string;
  category: string;
  state: string;
  description: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  actions?: ChatAction[];
  choices?: SuggestionItem[];
  heritageCards?: HeritageCard[];
  sources?: ChatSource[];
  mode?: string;
  unavailableReason?: string | null;
  timestamp: Date;
}

/** Phase 37 Part N — cited source metadata returned by the RAG path. */
interface ChatSource {
  n: number;
  title: string;
  sourceLabel: string;
  authorityTier: number | null;
  tierLabel: string;
  verificationStatus: string;
  url: string | null;
  license: string | null;
  language: string;
  score: number;
}

interface SuggestionItem {
  text: string;
  category?: string;
}

interface ChatAction {
  label: string;
  type: "view_heritage" | "view_map" | "view_timeline" | "explore_state" | "explore_category" | "ask_followup" | "view_location";
  target: string;
}

interface ChatResponseData {
  success: boolean;
  data: {
    reply: string;
    intent: string;
    state: string | null;
    knowledge_ids: string[];
    language: string;
    suggestions: SuggestionItem[];
    actions: ChatAction[];
    choices: SuggestionItem[];
    heritage_results: HeritageCard[];
    /* Phase 37 RAG contract (present on rag/no_answer modes) */
    answer?: string;
    sources?: ChatSource[];
    mode?: string;
    status?: string;
    unavailable_reason?: string | null;
    retrieval?: { count: number; languageFallback?: boolean; heritageFiltered?: boolean };
  };
}

interface WelcomeResponse {
  success: boolean;
  data: { message: string; language: string; suggestions: SuggestionItem[] };
}

/* ---- Supported languages for display ---- */

const LANGUAGE_OPTIONS: Language[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
];

/* ---- Typing Indicator ---- */

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex justify-start"
    >
      <div className="bg-white border border-border rounded-xl px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-terracotta" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-terracotta" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-terracotta" />
        </div>
        <span className="text-xs text-muted">Thinking...</span>
      </div>
    </motion.div>
  );
}

/* ---- ChatBot Component ---- */

export function ChatBot({ initialQuestion }: { initialQuestion?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("en");
  const [isLoading, setIsLoading] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [sessionId] = useState(() => `session-${Math.random().toString(36).slice(2, 10)}`);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [lastState, setLastState] = useState<string | null>(null);
  const idCounter = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentLang = LANGUAGE_OPTIONS.find((l) => l.code === language) || LANGUAGE_OPTIONS[0];

  // Fetch welcome message on mount
  useEffect(() => {
    async function fetchWelcome() {
      try {
        const res = await api.get<WelcomeResponse>(`/ai/welcome?language=${language}`);
        if (res.success) {
          setMessages([
            {
              id: "welcome",
              role: "assistant",
              content: res.data.message,
              intent: "greeting",
              timestamp: new Date(),
            },
          ]);
          if (res.data.suggestions) {
            setSuggestions(res.data.suggestions);
          }
        }
      } catch {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: "Welcome to Astrova. Ask me about India's heritage.",
            intent: "greeting",
            timestamp: new Date(),
          },
        ]);
      }
    }
    if (messages.length === 0) {
      fetchWelcome();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-send initial question from URL param
  const hasSentInitial = useRef(false);
  useEffect(() => {
    if (initialQuestion && !hasSentInitial.current && messages.length > 0) {
      hasSentInitial.current = true;
      // Small delay so welcome message renders first
      const timer = setTimeout(() => {
        handleSend(initialQuestion);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [initialQuestion, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const handleSend = async (text?: string | SuggestionItem) => {
    const messageText = (typeof text === "string" ? text : text?.text) || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${++idCounter.current}`,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await api.post<ChatResponseData>("/ai/chat", {
        message: messageText,
        language,
        session_id: sessionId,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${++idCounter.current}`,
        role: "assistant",
        content: res.data.answer || res.data.reply,
        intent: res.data.intent,
        actions: res.data.actions || [],
        choices: res.data.choices || [],
        heritageCards: res.data.heritage_results || [],
        sources: res.data.sources || [],
        mode: res.data.mode,
        unavailableReason: res.data.unavailable_reason ?? null,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setLastIntent(res.data.intent);
      setLastState(res.data.state);

      // Update context-aware suggestions
      if (res.data.suggestions && res.data.suggestions.length > 0) {
        setSuggestions(res.data.suggestions);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `error-${++idCounter.current}`,
        role: "assistant",
        content:
          err instanceof Error
            ? err.message
            : "Sorry, an error occurred. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  // Clear conversation
  const handleClear = () => {
    setMessages([]);
    setLastIntent(null);
    setLastState(null);
    api.get<WelcomeResponse>(`/ai/welcome?language=${language}`).then((res) => {
      if (res.success) {
        setMessages([
          {
            id: "welcome-new",
            role: "assistant",
            content: res.data.message,
            intent: "greeting",
            timestamp: new Date(),
          },
        ]);
        if (res.data.suggestions) {
          setSuggestions(res.data.suggestions);
        }
      }
    }).catch(() => {});
  };

  // Change language
  const handleLanguageChange = (code: string) => {
    setLanguage(code);
    setShowLangDropdown(false);
  };

  // Format message content with markdown-like bold
  const formatContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      const formatted = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-charcoal font-semibold">$1</strong>')
        .replace(/^- /gm, "• ");
      return (
        <span key={i}>
          {i > 0 && <br />}
          <span dangerouslySetInnerHTML={{ __html: formatted }} />
        </span>
      );
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col h-[600px] max-h-[80vh]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-parchment rounded-t-xl">
        <div className="flex items-center gap-2">            <motion.div
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta text-white"
            >
              <Sparkles className="h-4 w-4" />
            </motion.div>
          <div>
            <h3 className="text-sm font-semibold text-charcoal">Astrova</h3>
            <p className="text-[10px] text-stone">Heritage Guide</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowLangDropdown(!showLangDropdown)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-charcoal hover:bg-parchment transition-colors"
            >
              <Globe className="h-3.5 w-3.5 text-muted" />
              <span>{currentLang.nativeName}</span>
              <ChevronDown className="h-3 w-3 text-muted" />
            </motion.button>
            <AnimatePresence>
              {showLangDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-border bg-white shadow-lg z-50"
                >
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        language === lang.code
                          ? "bg-terracotta/5 text-terracotta font-medium"
                          : "text-charcoal hover:bg-parchment"
                      }`}
                    >
                      <span className="font-medium">{lang.nativeName}</span>
                      <span className="text-muted ml-1.5">({lang.name})</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Clear */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClear}
            className="rounded-lg p-1.5 text-muted hover:text-charcoal hover:bg-parchment transition-colors"
            aria-label="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-ivory">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-terracotta text-white"
                    : "bg-white border border-border text-charcoal"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="h-3 w-3 text-heritage-gold" />
                    <span className="text-[10px] font-medium text-stone">
                      Astrova
                      {msg.intent && msg.intent !== "greeting" && (
                        <Badge variant="outline" className="ml-1.5 text-[9px] py-0">
                          {msg.intent.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </span>
                  </div>
                )}
                <div className={msg.role === "user" ? "text-white" : "text-charcoal"}>
                  {formatContent(msg.content)}
                </div>
                {/* Phase 37 Part N — cited sources with authority badges */}
                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-border/50">
                    <p className="text-[10px] font-medium text-muted mb-1.5">Sources</p>
                    <div className="space-y-1.5">
                      {msg.sources.map((src) => {
                        const tierTone =
                          src.authorityTier === 1
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : src.authorityTier === 2
                            ? "bg-heritage-gold/10 text-heritage-gold border-heritage-gold/30"
                            : "bg-stone-100 text-stone border-stone-200";
                        const inner = (
                          <>
                            <span className="text-[10px] font-semibold text-muted mr-1.5">
                              [{src.n}]
                            </span>
                            <span className="text-xs font-medium text-charcoal truncate">
                              {src.title}
                            </span>
                            <span
                              className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${tierTone}`}
                            >
                              {src.tierLabel}
                            </span>
                            <span className="shrink-0 text-[9px] text-muted">
                              {src.sourceLabel}
                            </span>
                          </>
                        );
                        return src.url ? (
                          <a
                            key={src.n}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-ivory px-2.5 py-1.5 hover:border-terracotta/30 hover:bg-terracotta/5 transition-colors"
                          >
                            {inner}
                          </a>
                        ) : (
                          <div
                            key={src.n}
                            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-ivory px-2.5 py-1.5"
                          >
                            {inner}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Phase 37 — honest unavailable state, never a guess */}
                {msg.role === "assistant" && msg.mode === "no_answer" && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-[10px] font-medium text-amber-800">
                      INFORMATION UNAVAILABLE — no sourced answer in the knowledge base.
                    </span>
                  </div>
                )}
                {/* Heritage entity cards */}
                {msg.heritageCards && msg.heritageCards.length > 0 && msg.role === "assistant" && (
                  <div className="mt-3 space-y-2">
                    {msg.heritageCards.map((card) => (
                      <Link
                        key={card.id}
                        href={`/heritage/${card.slug}`}
                        className="block rounded-lg border border-border/60 bg-ivory p-3 hover:border-terracotta/30 hover:bg-terracotta/5 transition-colors group"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-terracotta/8">
                            <Landmark className="h-4 w-4 text-terracotta" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-sm font-semibold text-charcoal group-hover:text-terracotta transition-colors truncate">
                                {card.name}
                              </h4>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-terracotta/10 text-terracotta font-medium capitalize shrink-0">
                                {card.category}
                              </span>
                            </div>
                            {card.state && (
                              <p className="text-[10px] text-muted mt-0.5 flex items-center gap-1">
                                <MapPin className="h-2.5 w-2.5" />
                                {card.state}
                              </p>
                            )}
                            {card.description && (
                              <p className="text-xs text-stone mt-1 line-clamp-2">{card.description}</p>
                            )}
                          </div>
                          <Bookmark className="h-3.5 w-3.5 text-muted group-hover:text-terracotta shrink-0 mt-0.5" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {/* Action buttons */}
                {msg.actions && msg.actions.length > 0 && msg.role === "assistant" && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-border/50">
                    {msg.actions.map((action) => (
                      <Link
                        key={action.label}
                        href={action.target || "#"}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-terracotta/5 border border-terracotta/20 text-[11px] font-medium text-terracotta hover:bg-terracotta/10 hover:border-terracotta/30 transition-colors"
                        onClick={() => {
                          if (action.type === "ask_followup") {
                            inputRef.current?.focus();
                          }
                        }}
                      >
                        {action.type === "view_heritage" && <Landmark className="h-3 w-3" />}
                        {action.type === "view_map" && <Globe className="h-3 w-3" />}
                        {action.type === "view_timeline" && <Clock className="h-3 w-3" />}
                        {action.type === "explore_state" && <MapPin className="h-3 w-3" />}
                        {action.type === "explore_category" && <Palette className="h-3 w-3" />}
                        {action.type === "ask_followup" && <MessageSquare className="h-3 w-3" />}
                        {action.label}
                      </Link>
                    ))}
                  </div>
                )}
                {/* Guided choices */}
                {msg.choices && msg.choices.length > 0 && msg.role === "assistant" && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {msg.choices.map((choice) => (
                      <motion.button
                        key={choice.text}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleSend(choice.text)}
                        className="rounded-full border border-border bg-parchment px-2.5 py-1 text-[11px] text-muted hover:text-charcoal hover:border-terracotta/30 transition-colors"
                      >
                        {choice.text}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {isLoading && <TypingIndicator />}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Context-Aware Suggestions */}
      {suggestions.length > 0 && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-4 py-2 border-t border-border bg-parchment"
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <MessageSquare className="h-3 w-3 text-muted" />
            <p className="text-[10px] text-muted">
              {lastIntent ? "Try asking:" : "Suggested questions:"}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((q) => (
              <motion.button
                key={q.text}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSend(q.text)}
                className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-muted hover:text-charcoal hover:border-terracotta/30 transition-colors"
              >
                {q.text}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border bg-white rounded-b-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            aria-label="Ask Astrova a question"
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              currentLang.code === "en"
                ? "Ask about India's heritage..."
                : currentLang.code === "gu"
                ? "ભારતના વારસા વિશે પૂછો..."
                : currentLang.code === "hi"
                ? "भारत की विरासत के बारे में पूछें..."
                : currentLang.code === "mr"
                ? "भारताच्या वारशाबद्दल विचारा..."
                : currentLang.code === "ta"
                ? "இந்தியாவின் பாரம்பரியம் பற்றி கேளுங்கள்..."
                : "ਭਾਰਤ ਦੀ ਵਿਰਾਸਤ ਬਾਰੇ ਪੁੱਛੋ..."
            }
            className="flex-1 rounded-lg border border-border bg-parchment px-3 py-2 text-sm text-charcoal placeholder:text-warm-gray outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30 transition-colors"
            disabled={isLoading}
            maxLength={1000}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            className="bg-terracotta hover:bg-terracotta-light text-white shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-[9px] text-warm-gray mt-1.5 text-center">
          Responses are grounded in verified heritage data. Always verify important facts from primary sources.
        </p>
      </div>
    </motion.div>
  );
}
