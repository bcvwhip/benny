import { ArrowUp, Loader2, Mic, Paperclip, Plus, Square, X, UploadCloud } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { uploadFile } from '../lib/api.js';
import { VoiceRecognizer } from '../lib/audio.js';
import { FileAttachment } from '../types.js';
import { FileAttachmentCard } from './FileAttachmentCard.js';

interface ComposerProps {
  onSendMessage: (content: string, attachments: FileAttachment[]) => void;
  isGenerating: boolean;
  onStopGeneration: () => void;
  conversationId?: string;
  sttLanguage?: string;
  onOpenVoiceMode?: () => void;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isGenerating,
  onStopGeneration,
  conversationId,
  sttLanguage = 'it-IT',
  onOpenVoiceMode,
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('Analizzo il file...');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Voice recording state
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognizerRef = useRef<VoiceRecognizer | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 180);
      textareaRef.current.style.height = `${Math.max(48, newHeight)}px`;
    }
  }, [input]);

  // Initialize speech recognition
  useEffect(() => {
    recognizerRef.current = new VoiceRecognizer(
      sttLanguage,
      (transcript, isFinal) => {
        setInput((prev) => {
          const separator = prev && !prev.endsWith(' ') ? ' ' : '';
          return `${prev}${separator}${transcript}`;
        });
      },
      (error) => {
        setVoiceError(error);
        setIsListening(false);
      },
      (listening) => {
        setIsListening(listening);
      }
    );

    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.stop();
      }
    };
  }, [sttLanguage]);

  const handleToggleVoice = () => {
    setVoiceError(null);
    if (!recognizerRef.current) return;
    recognizerRef.current.toggle();
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setUploadError(null);
    setIsUploading(true);

    // Analysis visual state cycles
    setUploadStatus('Analizzo il file...');
    const t1 = setTimeout(() => setUploadStatus('Leggo il contenuto...'), 600);
    const t2 = setTimeout(() => setUploadStatus('Elaboro i dati...'), 1200);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 25 * 1024 * 1024) {
          throw new Error(`Il file "${file.name}" supera il limite massimo di 25 MB.`);
        }
        const uploaded = await uploadFile(file, conversationId);
        setAttachments((prev) => [...prev, uploaded]);
      }
      setUploadStatus('Operazione completata.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore upload e analisi file';
      setUploadError(msg);
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setTimeout(() => {
        setIsUploading(false);
      }, 500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = () => {
    if (isGenerating || isUploading) return;
    if (!input.trim() && attachments.length === 0) return;

    if (isListening && recognizerRef.current) {
      recognizerRef.current.stop();
    }

    onSendMessage(input.trim(), attachments);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-3 sm:pb-6 bg-[#0A0A0A]">
      {/* Upload or Voice Error Banner */}
      {(uploadError || voiceError) && (
        <div className="mb-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>{uploadError || voiceError}</span>
          <button
            onClick={() => {
              setUploadError(null);
              setVoiceError(null);
            }}
            className="text-rose-300 hover:text-white ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Attachment Badges Preview */}
      {(attachments.length > 0 || isUploading) && (
        <div className="flex flex-wrap gap-2.5 mb-3 p-2.5 rounded-2xl bg-[#111111] border border-[#222222]">
          {attachments.map((att) => (
            <FileAttachmentCard
              key={att.id}
              attachment={att}
              onRemove={() => handleRemoveAttachment(att.id)}
            />
          ))}

          {isUploading && (
            <div className="flex items-center space-x-3 px-4 py-3 rounded-xl bg-[#161616] border border-cyan-500/30 text-xs text-cyan-300 animate-pulse min-w-[240px]">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-white">Caricamento documento</span>
                <span className="font-mono text-[11px] text-cyan-400">{uploadStatus}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Composer Box */}
      <div
        className={`relative group ${isDragOver ? 'ring-2 ring-cyan-500 rounded-2xl' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-800 to-gray-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500 pointer-events-none" />

        <div className="relative bg-[#111111] border border-[#222222] rounded-2xl flex flex-col p-3 sm:p-4 focus-within:border-gray-600 transition-all shadow-xl">
          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            accept=".pdf,.docx,.xlsx,.xls,.csv,.pptx,.txt,.json,.md,.html,.ts,.js,.py,.jpg,.jpeg,.png,.webp"
          />

          {/* Text Input */}
          <textarea
            id="chat-composer-textarea"
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              attachments.length > 0
                ? "Fai una domanda sul documento, chiedi un riassunto o genera un file..."
                : "Chiedi qualsiasi cosa a 3 athlas, o carica un file con 📎..."
            }
            rows={2}
            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-gray-200 placeholder-gray-500 resize-none leading-relaxed overflow-y-auto"
          />

          {/* Drag Overlay Hint */}
          {isDragOver && (
            <div className="absolute inset-0 bg-[#0F0F0F]/90 rounded-2xl flex items-center justify-center space-x-2 border-2 border-dashed border-cyan-500 z-10">
              <UploadCloud className="w-6 h-6 text-cyan-400 animate-bounce" />
              <span className="text-sm font-medium text-cyan-300">
                Rilascia i file qui per caricarli e analizzarli con 3 athlas
              </span>
            </div>
          )}

          {/* Bottom Controls Bar */}
          <div className="flex justify-between items-center mt-2 pt-3 border-t border-[#222222]">
            {/* Left Action Buttons */}
            <div className="flex items-center space-x-2 text-gray-400">
              {/* Integrated File Upload Button (📎 / +) */}
              <button
                id="composer-attach-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                aria-label="Carica e analizza file (PDF, DOCX, XLSX, CSV, TXT, Immagini)"
                title="Carica documento (PDF, Word, Excel, CSV, PPTX, TXT, immagini)"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#1A1A1A] hover:bg-[#252525] border border-[#2D2D2D] hover:border-gray-500 text-gray-200 text-xs font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50 group"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    <span className="font-mono text-cyan-400 text-[11px]">{uploadStatus}</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center -space-x-1">
                      <Paperclip className="w-3.5 h-3.5 text-gray-300 group-hover:text-white" />
                      <Plus className="w-2.5 h-2.5 text-cyan-400" />
                    </div>
                    <span className="text-xs font-medium">Allega file</span>
                  </>
                )}
              </button>

              {/* Microphone Voice Mode Launcher */}
              <button
                id="composer-voice-mode-btn"
                type="button"
                onClick={onOpenVoiceMode ? onOpenVoiceMode : handleToggleVoice}
                aria-label="Avvia modalità vocale immersiva 3 athlas"
                title="Avvia modalità vocale immersiva 3 athlas (Orbe 3D, conversazione e VAD)"
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-950/30 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-400 hover:text-cyan-200 transition-all hover:scale-105 active:scale-95 group"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <Mic className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium hidden sm:inline text-cyan-300 group-hover:text-white">
                  Voce 3 athlas
                </span>
              </button>
            </div>

            {/* Right Submit / Stop Button */}
            <div>
              {isGenerating ? (
                <button
                  id="composer-stop-btn"
                  type="button"
                  onClick={onStopGeneration}
                  aria-label="Ferma generazione"
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold shadow-lg transition-all active:scale-95"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  id="composer-send-btn"
                  type="button"
                  onClick={handleSend}
                  disabled={(!input.trim() && attachments.length === 0) || isUploading}
                  aria-label="Invia messaggio"
                  className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center transition-all ${
                    (input.trim() || attachments.length > 0) && !isUploading
                      ? 'bg-white text-black hover:bg-gray-200 shadow-lg active:scale-95 cursor-pointer'
                      : 'bg-[#1C1C1C] text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-[10px] text-gray-500 mt-3 font-mono">
        3 athlas • Gestione, analisi e generazione file documentali (PDF, DOCX, XLSX, PPTX, CSV)
      </p>
    </div>
  );
};
