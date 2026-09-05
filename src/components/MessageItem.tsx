import {
  Check,
  Copy,
  Edit2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateFile } from '../lib/api.js';
import { speakText, stopSpeaking } from '../lib/audio.js';
import { GeneratedFile, GeneratedFileFormat, Message } from '../types.js';
import { CodeBlock } from './CodeBlock.js';
import { FileAttachmentCard } from './FileAttachmentCard.js';
import { GeneratedFileCard } from './GeneratedFileCard.js';

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, currentContent: string) => void;
  onRate?: (messageId: string, rating: 1 | -1 | 0) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isStreaming = false,
  onRegenerate,
  onEdit,
  onRate,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [extraGeneratedFiles, setExtraGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState<string | null>(null);

  const isUser = message.role === 'user';

  // Compute combined generated files seamlessly without synchronization useEffect loops
  const displayGeneratedFiles = useMemo(() => {
    const map = new Map<string, GeneratedFile>();
    if (message.generatedFiles && message.generatedFiles.length > 0) {
      for (const file of message.generatedFiles) {
        map.set(file.id, file);
      }
    }
    for (const file of extraGeneratedFiles) {
      map.set(file.id, file);
    }
    return Array.from(map.values());
  }, [message.generatedFiles, extraGeneratedFiles]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleToggleSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speakText(
        message.content,
        1.0,
        'it-IT',
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );
    }
  };

  const handleSaveInlineEdit = () => {
    if (onEdit && editDraft.trim() && editDraft !== message.content) {
      onEdit(message.id, editDraft.trim());
    }
    setIsEditingInline(false);
  };

  const handleQuickGenerate = async (format: GeneratedFileFormat) => {
    if (isGeneratingDoc || !message.content.trim()) return;

    try {
      setIsGeneratingDoc(format);
      const generated = await generateFile({
        format,
        content: message.content,
        conversationId: message.conversationId,
        messageId: message.id,
      });

      setExtraGeneratedFiles((prev) => [...prev, generated]);
    } catch (err) {
      console.error('Failed to generate document from message:', err);
    } finally {
      setIsGeneratingDoc(null);
    }
  };

  return (
    <div
      id={`message-${message.id}`}
      className={`group w-full max-w-4xl mx-auto py-5 px-3 sm:px-6 transition-colors rounded-2xl ${
        isUser
          ? 'bg-transparent'
          : 'bg-[#0F0F0F] border border-[#222222] shadow-sm'
      }`}
    >
      <div className="flex items-start space-x-3.5 sm:space-x-4">
        {/* Avatar */}
        <div className="shrink-0 mt-0.5">
          {isUser ? (
            <div className="w-8 h-8 rounded-lg bg-[#222222] border border-[#2E2E2E] flex items-center justify-center shadow-md">
              <span className="text-[11px] font-semibold text-gray-200">TU</span>
            </div>
          ) : (
            <div className="relative w-8 h-8 rounded-lg bg-white shrink-0 flex items-center justify-center text-black font-bold text-xs shadow-[0_0_15px_rgba(255,255,255,0.15)]">
              <span>3</span>
              {isStreaming && (
                <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white rounded-full animate-ping" />
              )}
            </div>
          )}
        </div>

        {/* Message Content & Headers */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold tracking-wide text-gray-200">
                {isUser ? 'Tu' : '3 athlas'}
              </span>
              {!isUser && (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#1A1A1A] border border-[#2A2A2A] text-gray-400">
                  Mistral AI
                </span>
              )}
              <span className="text-[10px] bg-[#1A1A1A] px-2 py-0.5 rounded text-gray-500 font-mono">
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {/* User Edit Trigger */}
            {isUser && !isEditingInline && onEdit && (
              <button
                onClick={() => setIsEditingInline(true)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-white rounded hover:bg-[#1A1A1A]"
                title="Modifica messaggio"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Attached Files List */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2.5 my-2.5">
              {message.attachments.map((att) => (
                <FileAttachmentCard key={att.id} attachment={att} />
              ))}
            </div>
          )}

          {/* Body */}
          {isEditingInline ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="w-full p-3 text-sm rounded-xl bg-[#141414] border border-[#333333] text-gray-100 focus:outline-none focus:border-white"
                rows={3}
              />
              <div className="flex space-x-2 justify-end">
                <button
                  onClick={() => setIsEditingInline(false)}
                  className="px-3 py-1 text-xs rounded-lg bg-[#1A1A1A] text-gray-300 hover:bg-[#222222]"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveInlineEdit}
                  className="px-3 py-1 text-xs rounded-lg bg-white text-black font-semibold hover:bg-gray-200"
                >
                  Invia e Rigenera
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-invert max-w-none text-gray-200 text-sm sm:text-base leading-relaxed break-words">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeStr = String(children).replace(/\n$/, '');
                    if (!inline && (match || codeStr.includes('\n'))) {
                      return <CodeBlock language={match ? match[1] : 'code'} value={codeStr} />;
                    }
                    return (
                      <code
                        className="px-1.5 py-0.5 rounded bg-[#1A1A1A] text-gray-200 font-mono text-[13px] border border-[#2A2A2A]"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="my-4 overflow-x-auto rounded-lg border border-[#222222]">
                        <table className="min-w-full divide-y divide-[#222222] text-sm">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="px-3 py-2 bg-[#1A1A1A] font-semibold text-gray-200 text-left text-xs uppercase tracking-wider">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return <td className="px-3 py-2 border-t border-[#222222] text-gray-300">{children}</td>;
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white underline underline-offset-2 hover:text-gray-300 transition-colors"
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {message.content}
              </Markdown>

              {/* Real-time Streaming Cursor */}
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-white animate-pulse align-middle ml-1 rounded-sm" />
              )}
            </div>
          )}

          {/* Generated File Cards (Official 3 athlas artifact) */}
          {displayGeneratedFiles.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#222222]">
              <div className="text-[11px] font-mono text-gray-400 mb-2 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Documenti generati da 3 athlas:</span>
              </div>
              <div className="space-y-2">
                {displayGeneratedFiles.map((file) => (
                  <GeneratedFileCard key={file.id} file={file} />
                ))}
              </div>
            </div>
          )}

          {/* Action Bar (Only for Assistant messages) */}
          {!isUser && !isStreaming && (
            <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-[#222222] text-gray-400">
              {/* Copy */}
              <button
                id={`copy-msg-${message.id}`}
                onClick={handleCopy}
                aria-label="Copia risposta"
                title="Copia risposta negli appunti"
                className="flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs hover:text-white hover:bg-[#1A1A1A] transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 text-[11px]">Copiato</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Copia</span>
                  </>
                )}
              </button>

              {/* Text-To-Speech */}
              <button
                id={`speak-msg-${message.id}`}
                onClick={handleToggleSpeak}
                aria-label="Ascolta messaggio con voce"
                title={isSpeaking ? 'Ferma lettura' : 'Ascolta risposta'}
                className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${
                  isSpeaking
                    ? 'text-white bg-[#222222]'
                    : 'hover:text-white hover:bg-[#1A1A1A]'
                }`}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-white animate-pulse" />
                    <span className="text-[11px] text-white">Pausa</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Ascolta</span>
                  </>
                )}
              </button>

              {/* Regenerate */}
              {onRegenerate && (
                <button
                  id={`regenerate-msg-${message.id}`}
                  onClick={() => onRegenerate(message.id)}
                  aria-label="Rigenera risposta"
                  title="Rigenera risposta con Mistral"
                  className="flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs hover:text-white hover:bg-[#1A1A1A] transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Rigenera</span>
                </button>
              )}

              {/* Quick Document Generation Actions */}
              <div className="flex items-center space-x-1 pl-1 sm:border-l sm:border-[#262626]">
                <button
                  onClick={() => handleQuickGenerate('docx')}
                  disabled={!!isGeneratingDoc}
                  title="Trasforma questa risposta in un documento Word (.docx)"
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg text-xs text-blue-400/90 hover:text-blue-300 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                >
                  {isGeneratingDoc === 'docx' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                  <span className="text-[11px]">Word</span>
                </button>

                <button
                  onClick={() => handleQuickGenerate('xlsx')}
                  disabled={!!isGeneratingDoc}
                  title="Estrai o trasforma in foglio Excel (.xlsx)"
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg text-xs text-emerald-400/90 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                >
                  {isGeneratingDoc === 'xlsx' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3 h-3" />
                  )}
                  <span className="text-[11px]">Excel</span>
                </button>

                <button
                  onClick={() => handleQuickGenerate('pptx')}
                  disabled={!!isGeneratingDoc}
                  title="Trasforma in una presentazione PowerPoint (.pptx)"
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg text-xs text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                >
                  {isGeneratingDoc === 'pptx' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Presentation className="w-3 h-3" />
                  )}
                  <span className="text-[11px]">Slide</span>
                </button>

                <button
                  onClick={() => handleQuickGenerate('pdf')}
                  disabled={!!isGeneratingDoc}
                  title="Esporta questa risposta in PDF (.pdf)"
                  className="flex items-center space-x-1 px-2 py-1 rounded-lg text-xs text-rose-400/90 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                >
                  {isGeneratingDoc === 'pdf' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                  <span className="text-[11px]">PDF</span>
                </button>
              </div>

              {/* Rating Feedback */}
              {onRate && (
                <div className="flex items-center space-x-1 pl-1 ml-auto">
                  <button
                    id={`rate-up-${message.id}`}
                    onClick={() => onRate(message.id, message.rating === 1 ? 0 : 1)}
                    aria-label="Feedback positivo"
                    title="Feedback positivo"
                    className={`p-1.5 rounded-lg hover:bg-[#1A1A1A] transition-colors ${
                      message.rating === 1 ? 'text-emerald-400' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    id={`rate-down-${message.id}`}
                    onClick={() => onRate(message.id, message.rating === -1 ? 0 : -1)}
                    aria-label="Feedback negativo"
                    title="Feedback negativo"
                    className={`p-1.5 rounded-lg hover:bg-[#1A1A1A] transition-colors ${
                      message.rating === -1 ? 'text-rose-400' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
