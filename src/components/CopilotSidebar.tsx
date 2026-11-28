import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  Zap,
  X,
  Copy,
  Check,
  RotateCcw,
  Terminal,
  Code2,
  Cpu,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  copilotStatusLabel,
  DEFAULT_BACKEND,
  fetchWithBackendFallback,
  type CopilotStatus,
  type RuntimeCapabilityState,
} from '../lib/api';

export interface CopilotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  externalPrompt?: string | null;
  onClearExternalPrompt?: () => void;
  /** Runtime reported by /api/v1/copilot/status; never assume the local model. */
  copilotStatus?: CopilotStatus | null;
  runtimeCapability?: RuntimeCapabilityState | null;
}

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
  model?: string;
}

interface CopilotDiagnosis {
  summary?: string;
  suggested_block_m?: number;
  suggested_block_n?: number;
  suggested_block_k?: number;
  suggested_warps?: number;
  suggested_stages?: number;
  root_cause_diagnosis?: string | null;
  repaired_kernel_code?: string | null;
}

/** Renders the backend `{ source, diagnosis }` contract as markdown for the chat bubble. */
function formatDiagnosis(payload: any): string {
  const diagnosis: CopilotDiagnosis | undefined = payload?.diagnosis;
  if (!diagnosis) {
    return payload?.response || payload?.message || 'Copilot returned an empty diagnosis.';
  }

  const sections: string[] = [`### ${diagnosis.summary || 'Kernel diagnosis'}`];

  const tuning: string[] = [];
  if (diagnosis.suggested_block_m != null) tuning.push(`- \`BLOCK_SIZE_M = ${diagnosis.suggested_block_m}\``);
  if (diagnosis.suggested_block_n != null) tuning.push(`- \`BLOCK_SIZE_N = ${diagnosis.suggested_block_n}\``);
  if (diagnosis.suggested_block_k != null) tuning.push(`- \`BLOCK_SIZE_K = ${diagnosis.suggested_block_k}\``);
  if (diagnosis.suggested_warps != null) tuning.push(`- \`num_warps = ${diagnosis.suggested_warps}\``);
  if (diagnosis.suggested_stages != null) tuning.push(`- \`num_stages = ${diagnosis.suggested_stages}\``);
  if (tuning.length > 0) sections.push(['**Suggested configuration**', ...tuning].join('\n'));

  if (diagnosis.root_cause_diagnosis) {
    sections.push(`**Root cause**\n${diagnosis.root_cause_diagnosis}`);
  }

  if (diagnosis.repaired_kernel_code) {
    sections.push(
      ['**Repaired kernel**', '```python', diagnosis.repaired_kernel_code.trim(), '```'].join('\n')
    );
  }

  const sourceLabels: Record<string, string> = {
    pydantic_ai_ollama: 'local model',
    pydantic_ai_rule_engine: 'deterministic rule engine (no LLM)',
  };
  sections.push(
    `_source: ${sourceLabels[payload?.source] ?? payload?.source ?? 'mandala-copilot'}_`
  );
  return sections.join('\n\n');
}

const CAPABILITIES = `I can assist you with:
- **Triton Block Size Tuning**: candidate \`BLOCK_SIZE\` values (64, 128, 256, 512) for AMD Wave64
- **AMD MFMA Matrix Cores**: how Triton lowers dot products on gfx942
- **LDS Bank Conflicts**: avoiding 32-bank collisions in Local Data Share
- **PyTorch Buffer Integration**: interfacing zero-copy device tensors`;

/** The greeting states which runtime will actually answer. */
function greetingFor(status: CopilotStatus | null | undefined): string {
  if (!status) {
    return '### Mandala AI Copilot\nChecking which runtime will answer…';
  }
  if (status.source === 'pydantic_ai_ollama') {
    return `### Mandala AI Copilot Online\nServed by **${status.model}** via \`${status.endpoint}\`.\n\n${CAPABILITIES}`;
  }
  return `### Mandala AI Copilot (rule engine)\nNo local model is answering, so replies come from the deterministic rule engine.\n\n${status.detail}\n\n${CAPABILITIES}`;
}

export const CopilotSidebar: React.FC<CopilotSidebarProps> = ({
  isOpen,
  onClose,
  externalPrompt,
  onClearExternalPrompt,
  copilotStatus = null,
  runtimeCapability = null,
}) => {
  const copilotLabel = copilotStatusLabel(copilotStatus);
  const copilotLive = copilotStatus?.source === 'pydantic_ai_ollama';
  const deviceLabel =
    runtimeCapability?.status === 'available' && runtimeCapability.device_arch
      ? `${runtimeCapability.device_arch} (${runtimeCapability.backend.toUpperCase()})`
      : 'No GPU runtime verified';

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-init',
      role: 'assistant',
      content: `### Mandala AI Copilot Online
Copilot runtime not verified yet.

I can assist you with:
- **Triton Block Size Tuning**: Optimal \`BLOCK_SIZE\` (64, 128, 256, 512) for AMD Wave64
- **AMD MFMA Matrix Cores**: Leveraging \`v_mfma_f32_16x16x16_bf16\` on gfx942
- **LDS Bank Conflicts**: Preventing 32-bank collisions in Local Data Share
- **PyTorch Buffer Integration**: Interfacing zero-copy hip:0 tensors`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: copilotLabel,
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Replace the unverified greeting once the backend reports its runtime.
  useEffect(() => {
    if (!copilotStatus) return;
    setMessages((prev) =>
      prev.length === 1 && prev[0].id === 'msg-init'
        ? [
            {
              ...prev[0],
              content: greetingFor(copilotStatus),
              model: copilotStatusLabel(copilotStatus),
            },
          ]
        : prev
    );
  }, [copilotStatus]);

  useEffect(() => {
    if (externalPrompt) {
      sendMessage(externalPrompt);
      if (onClearExternalPrompt) onClearExternalPrompt();
    }
  }, [externalPrompt]);

  const sendMessage = async (customText?: string) => {
    const text = customText || inputMessage.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputMessage('');
    setIsLoading(true);

    try {
      // Connect to http://localhost:8000/api/v1/copilot/chat (with fallback)
      const response = await fetchWithBackendFallback('/api/v1/copilot/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversation_history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Copilot request failed (HTTP ${response.status})`);
      }

      const data = await response.json();
      const replyContent = formatDiagnosis(data);

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: replyContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: copilotLabel,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Unable to reach the Mandala Copilot API (http://localhost:8000/api/v1/copilot/chat): ${err.message}. Ensure main-api.py is running.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          model: copilotLabel,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const samplePrompts = [
    'How should I tune BLOCK_SIZE for MI300X gfx942?',
    'Explain AMD Wave64 vs Wave32 execution in Triton',
    'How to prevent LDS bank conflicts with large vector sizes?',
  ];

  if (!isOpen) return null;

  return (
    <aside className="w-96 flex flex-col shrink-0 border-l border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md z-20 font-sans shadow-2xl">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-800/80 px-4 select-none">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-wider text-zinc-100 uppercase">
              Mandala Copilot
            </h2>
            <div
              className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono"
              title={copilotStatus?.detail ?? 'Waiting for /api/v1/copilot/status'}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${copilotLive ? 'bg-cyan-400' : 'bg-amber-400'}`}
              ></span>
              <span className={copilotLive ? 'text-cyan-300' : 'text-amber-300'}>
                {copilotLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              setMessages([
                {
                  id: 'msg-init-reset',
                  role: 'assistant',
                  content: 'Chat cleared. How can I assist with your ROCm kernel optimization?',
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  model: copilotLabel,
                },
              ])
            }
            title="Clear conversation"
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Close sidebar"
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Target specs bar */}
      <div className="flex items-center justify-between border-b border-zinc-900 bg-zinc-900/40 px-4 py-2 text-[11px] font-mono text-zinc-400">
        <span className="flex items-center gap-1">
          <Cpu className="h-3 w-3 text-cyan-400" />
          API: {DEFAULT_BACKEND}
        </span>
        <span className={runtimeCapability?.status === 'available' ? 'text-emerald-400' : 'text-amber-400'}>
          {deviceLabel}
        </span>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin scrollbar-thumb-zinc-800">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col space-y-1.5 ${
              m.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono px-1">
              {m.role === 'user' ? (
                <>
                  <span>You</span>
                  <span>•</span>
                  <span>{m.timestamp}</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 text-cyan-400" />
                  <span className="text-zinc-300 font-semibold">{m.model || copilotLabel}</span>
                  <span>•</span>
                  <span>{m.timestamp}</span>
                </>
              )}
            </div>

            <div
              className={`rounded-xl px-3.5 py-2.5 max-w-[92%] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-cyan-950/60 border border-cyan-600/40 text-cyan-100 shadow-sm'
                  : 'bg-zinc-900/90 border border-zinc-800 text-zinc-200 shadow-sm'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="space-y-2 prose prose-invert prose-xs max-w-none">
                  <div className="markdown-body">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleCopy(m.content, m.id)}
                      className="flex items-center gap-1 rounded bg-zinc-950 px-2 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check className="h-2.5 w-2.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-2.5 w-2.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col space-y-1.5 items-start">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono px-1">
              <Sparkles className="h-3 w-3 text-cyan-400 animate-spin" />
              <span>{copilotLabel} thinking...</span>
            </div>
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-zinc-400 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse delay-75"></span>
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse delay-150"></span>
              <span className="text-xs font-mono">Analyzing kernel IR...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      <div className="px-4 py-2 border-t border-zinc-900 bg-zinc-950/40 space-y-1">
        <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
          Suggested Prompts
        </p>
        <div className="flex flex-col gap-1">
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => sendMessage(prompt)}
              className="text-left text-[11px] text-zinc-400 hover:text-cyan-300 hover:bg-zinc-900/80 p-1.5 rounded transition truncate border border-transparent hover:border-zinc-800"
            >
              › {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input box */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask Copilot about ROCm / Triton..."
            disabled={isLoading}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 pr-10 text-xs text-zinc-100 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
          <button
            type="submit"
            disabled={isLoading || !inputMessage.trim()}
            className="absolute right-2 rounded-md bg-cyan-600 p-1.5 text-zinc-950 hover:bg-cyan-500 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
};
