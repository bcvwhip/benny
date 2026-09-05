import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Keyboard,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Sliders,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import { VoiceEngine, VOICE_PERSONALITIES } from '../lib/voiceEngine.js';
import {
  Conversation,
  Message,
  VoiceOrbState,
  VoicePersonalityId,
  VoiceSettings,
} from '../types.js';
import { AthlasOrb } from './AthlasOrb.js';

interface VoiceModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  activeConversation: Conversation | null;
  messages: Message[];
  isGenerating: boolean;
  streamingContent?: string;
  onSendMessage: (text: string) => Promise<void>;
  onNewConversation?: () => void;
  initialVoiceSettings?: Partial<VoiceSettings>;
  onUpdateVoiceSettings?: (settings: VoiceSettings) => void;
}

export const VoiceModeOverlay: React.FC<VoiceModeOverlayProps> = ({
  isOpen,
  onClose,
  activeConversation,
  messages,
  isGenerating,
  streamingContent = '',
  onSendMessage,
  onNewConversation,
  initialVoiceSettings,
  onUpdateVoiceSettings,
}) => {
  // Voice engine & state
  const [orbState, setOrbState] = useState<VoiceOrbState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencies, setFrequencies] = useState<Uint8Array>(new Uint8Array(64));
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [assistantSpokenText, setAssistantSpokenText] = useState('');
  const [highlightedWordIndex, setHighlightedWordIndex] = useState<{ start: number; length: number } | null>(null);

  // Settings state
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    personality: 'aria',
    continuousConversation: true,
    bargeInEnabled: true,
    autoSpeakResponse: true,
    micSensitivity: 0.8,
    soundEffects: true,
    ...initialVoiceSettings,
  });

  // UI state
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [voiceCommandToast, setVoiceCommandToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const voiceEngineRef = useRef<VoiceEngine | null>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<any>(null);

  // Status labels & subtitles for the 4 states
  const STATUS_INFO: Record<VoiceOrbState, { title: string; subtitle: string; color: string }> = {
    listening: {
      title: 'Ti ascolto…',
      subtitle: 'Parla liberamente, 3 athlas è pronto a rispondere.',
      color: '#00E5FF',
    },
    thinking: {
      title: 'Sto pensando…',
      subtitle: 'Elaborazione logica in corso attraverso la rete neurale.',
      color: '#C084FC',
    },
    speaking: {
      title: '3 athlas',
      subtitle: 'Risposta vocale attiva. Puoi interrompere in qualsiasi momento.',
      color: '#38BDF8',
    },
    idle: {
      title: 'Parlami…',
      subtitle: 'Tocca il microfono o inizia a parlare per avviare la conversazione.',
      color: '#F1F5F9',
    },
  };

  const showToast = (message: string) => {
    setVoiceCommandToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setVoiceCommandToast(null);
    }, 3500);
  };

  // Initialize and tear down VoiceEngine
  useEffect(() => {
    if (!isOpen) {
      if (voiceEngineRef.current) {
        voiceEngineRef.current.destroy();
        voiceEngineRef.current = null;
      }
      return;
    }

    const engine = new VoiceEngine(
      {
        onStateChange: (newState) => {
          setOrbState(newState);
        },
        onInterimTranscript: (text) => {
          setInterimTranscript(text);
        },
        onFinalTranscript: (text) => {
          setFinalTranscript(text);
          setInterimTranscript('');
        },
        onSpeechComplete: async (fullText) => {
          setInterimTranscript('');
          setFinalTranscript(fullText);
          try {
            await onSendMessage(fullText);
          } catch (err) {
            setErrorMessage('Errore durante l’invio della richiesta vocale.');
            engine.setState('idle');
          }
        },
        onAudioData: (level, freqs) => {
          setAudioLevel(level);
          setFrequencies(freqs);
        },
        onBargeIn: () => {
          showToast('⚡ Interruzione naturale rilevata. Ti ascolto...');
          setAssistantSpokenText('');
          setHighlightedWordIndex(null);
        },
        onWordBoundary: (charIndex, length) => {
          setHighlightedWordIndex({ start: charIndex, length });
        },
        onTtsStart: () => {
          // TTS started
        },
        onTtsEnd: () => {
          setHighlightedWordIndex(null);
        },
        onError: (err) => {
          setErrorMessage(err);
        },
        onVoiceCommand: (cmd) => {
          if (cmd === 'exit_voice') {
            showToast('⌨️ Passaggio alla modalità testo...');
            setTimeout(() => onClose(), 600);
          } else if (cmd === 'new_chat') {
            showToast('✨ Creazione di una nuova conversazione...');
            onNewConversation?.();
          } else if (cmd === 'stop_speaking') {
            showToast('⏹️ Risposta interrotta.');
          } else if (cmd === 'summarize') {
            showToast('📝 Generazione riassunto in corso...');
            onSendMessage('3 athlas, per favore riassumi i punti salienti di questa conversazione.');
          }
        },
      },
      voiceSettings
    );

    voiceEngineRef.current = engine;
    engine.start();

    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      engine.destroy();
      voiceEngineRef.current = null;
    };
  }, [isOpen]);

  // Synchronize AI response streaming to voice
  useEffect(() => {
    if (!isOpen) return;

    if (isGenerating && streamingContent) {
      setAssistantSpokenText(streamingContent);
      setOrbState((prev) => (prev !== 'thinking' && prev !== 'speaking' ? 'thinking' : prev));
    } else if (!isGenerating && streamingContent && voiceSettings.autoSpeakResponse) {
      // Stream finished, trigger natural vocal speech
      if (voiceEngineRef.current) {
        setAssistantSpokenText(streamingContent);
        voiceEngineRef.current.speak(streamingContent, voiceSettings.personality);
      }
    }
  }, [isGenerating, streamingContent, isOpen]);

  // Auto-scroll history drawer when opened or updated
  useEffect(() => {
    if (showHistory && historyScrollRef.current) {
      historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
    }
  }, [showHistory, messages, streamingContent]);

  // Actions
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    voiceEngineRef.current?.setMute(nextMuted);
    if (nextMuted) {
      showToast('Microfono disattivato');
    } else {
      showToast('Microfono attivo: Ti ascolto…');
    }
  };

  const handleTogglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      voiceEngineRef.current?.startListening();
      showToast('Ascolto ripreso');
    } else {
      setIsPaused(true);
      voiceEngineRef.current?.stopListening();
      voiceEngineRef.current?.setState('idle');
      showToast('Ascolto in pausa');
    }
  };

  const handleStopSpeaking = () => {
    voiceEngineRef.current?.stopSpeaking();
    setAssistantSpokenText('');
    setHighlightedWordIndex(null);
    voiceEngineRef.current?.startListening();
    showToast('Risposta vocale interrotta');
  };

  const handleSelectPersonality = (pId: VoicePersonalityId) => {
    const updated = { ...voiceSettings, personality: pId };
    setVoiceSettings(updated);
    voiceEngineRef.current?.updateSettings({ personality: pId });
    onUpdateVoiceSettings?.(updated);
    showToast(`Personalità vocale: ${VOICE_PERSONALITIES[pId].name}`);
  };

  if (!isOpen) return null;

  const currentStatus = STATUS_INFO[orbState] || STATUS_INFO.idle;
  const currentPersonality = VOICE_PERSONALITIES[voiceSettings.personality] || VOICE_PERSONALITIES.aria;

  return (
    <AnimatePresence>
      <motion.div
        id="athlas-voice-modal"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-50 flex flex-col bg-[#050507]/95 backdrop-blur-2xl text-gray-100 overflow-hidden select-none"
      >
        {/* Atmospheric ambient digital gradient background */}
        <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
          <div
            className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-[140px] opacity-25 transition-colors duration-1000"
            style={{ backgroundColor: currentStatus.color }}
          />
          <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
        </div>

        {/* TOP BAR */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-8 border-b border-white/[0.07] z-20">
          {/* Brand & Status Indicator */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-wider text-white">3</span>
              <span className="font-light text-lg tracking-widest text-gray-300">athlas</span>
            </div>

            <div className="h-4 w-[1px] bg-white/20 hidden sm:block" />

            {/* State pill */}
            <div
              className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-500"
              style={{
                borderColor: `${currentStatus.color}40`,
                backgroundColor: `${currentStatus.color}15`,
                color: currentStatus.color,
              }}
            >
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: currentStatus.color }}
              />
              <span className="capitalize">{currentStatus.title}</span>
            </div>
          </div>

          {/* Right Top Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Personality selector quick pill */}
            <button
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs transition-colors"
              title="Cambia personalità vocale"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentPersonality.color }}
              />
              <span className="font-medium text-gray-200">{currentPersonality.name}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {/* Conversation History Drawer toggle */}
            <button
              id="voice-history-toggle"
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
                showHistory
                  ? 'bg-white/20 border-white/30 text-white'
                  : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.08] text-gray-300'
              }`}
              title="Visualizza cronologia chat"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cronologia</span>
            </button>

            {/* Switch to Text mode button */}
            <button
              id="voice-to-text-btn"
              onClick={onClose}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              title="Torna alla modalità testo"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Testo</span>
            </button>
          </div>
        </header>

        {/* VOICE COMMAND TOAST NOTIFICATION */}
        <AnimatePresence>
          {voiceCommandToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-40 flex items-center space-x-2 px-4 py-2 rounded-2xl bg-black/80 border border-white/20 shadow-2xl backdrop-blur-xl text-xs text-white"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>{voiceCommandToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ERROR NOTIFICATION */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-40 max-w-md w-full px-4"
            >
              <div className="flex items-start justify-between p-3.5 rounded-2xl bg-rose-950/80 border border-rose-600/40 text-rose-200 text-xs shadow-2xl backdrop-blur-xl">
                <div className="flex items-center space-x-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="p-1 text-rose-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MAIN VOCAL STAGE */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden">
          {/* THE 3D ATHLAS ORB */}
          <div className="relative w-full max-w-[440px] h-[360px] sm:h-[420px] flex items-center justify-center">
            <AthlasOrb
              state={orbState}
              audioLevel={audioLevel}
              frequencies={frequencies}
              size={360}
            />
          </div>

          {/* STATE STATUS TYPOGRAPHY */}
          <div className="text-center mt-3 sm:mt-4 space-y-1 z-10">
            <h2
              className="text-2xl sm:text-3xl font-semibold tracking-wide transition-colors duration-500"
              style={{ color: currentStatus.color }}
            >
              {currentStatus.title}
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 max-w-sm mx-auto font-light">
              {currentStatus.subtitle}
            </p>
          </div>

          {/* LIVE TRANSCRIPT BUBBLE (What user is saying in real-time) */}
          <AnimatePresence>
            {(interimTranscript || (orbState === 'listening' && finalTranscript)) && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="mt-4 max-w-lg w-full px-5 py-3 rounded-2xl bg-white/[0.07] border border-white/15 backdrop-blur-xl text-center shadow-xl z-10"
              >
                <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 block mb-1">
                  Trascrizione live
                </span>
                <p className="text-sm sm:text-base text-gray-100 font-medium leading-relaxed">
                  “{interimTranscript || finalTranscript}”
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* DYNAMIC SPOKEN AI RESPONSE WITH READING HIGHLIGHT */}
          <AnimatePresence>
            {assistantSpokenText && orbState === 'speaking' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-3 max-w-xl w-full px-5 py-3.5 rounded-2xl bg-blue-950/30 border border-blue-500/25 backdrop-blur-xl text-center shadow-2xl z-10 max-h-36 overflow-y-auto"
              >
                <div className="flex items-center justify-center space-x-1.5 text-xs text-blue-400 mb-1.5 font-medium">
                  <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                  <span>3 athlas sta rispondendo…</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-200 leading-relaxed font-normal">
                  {assistantSpokenText.length > 280
                    ? `${assistantSpokenText.slice(0, 280)}...`
                    : assistantSpokenText}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* SIDE CONVERSATION HISTORY DRAWER (Collapsible without leaving voice mode) */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="absolute top-16 right-0 bottom-24 w-full sm:w-96 bg-[#0B0B0E]/95 border-l border-white/10 z-30 shadow-2xl flex flex-col backdrop-blur-2xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <History className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">Cronologia chat</h3>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div ref={historyScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    Nessun messaggio in questa conversazione. Inizia a parlare!
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-2xl ${
                        m.role === 'user'
                          ? 'bg-white/10 text-white ml-6'
                          : 'bg-blue-950/40 border border-blue-900/40 text-gray-200 mr-6'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 text-[10px] text-gray-400">
                        <span className="font-semibold">
                          {m.role === 'user' ? 'Tu' : '3 athlas'}
                        </span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </div>
                  ))
                )}
                {streamingContent && isGenerating && (
                  <div className="p-3 rounded-2xl bg-blue-950/40 border border-blue-900/40 text-gray-200 mr-6">
                    <span className="text-[10px] text-cyan-400 block mb-1">In generazione…</span>
                    <p className="whitespace-pre-wrap leading-relaxed">{streamingContent}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* VOICE SETTINGS DRAWER */}
        <AnimatePresence>
          {showSettingsDrawer && (
            <motion.div
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-lg p-5 rounded-3xl bg-[#111116]/95 border border-white/15 backdrop-blur-2xl shadow-2xl z-40 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">Personalità vocale & Opzioni</h3>
                </div>
                <button
                  onClick={() => setShowSettingsDrawer(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Personality Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                {(Object.keys(VOICE_PERSONALITIES) as VoicePersonalityId[]).map((pId) => {
                  const p = VOICE_PERSONALITIES[pId];
                  const isSelected = voiceSettings.personality === pId;
                  return (
                    <button
                      key={pId}
                      onClick={() => handleSelectPersonality(pId)}
                      className={`p-3 rounded-2xl text-left border transition-all ${
                        isSelected
                          ? 'bg-white/10 border-white/30 ring-1 ring-white/20'
                          : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.07]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="font-semibold text-xs text-white">{p.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </div>
                      <span className="text-[11px] text-gray-300 block">{p.tagline}</span>
                      <span className="text-[10px] text-gray-400 mt-1 block leading-tight">
                        {p.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-2 border-t border-white/10 text-xs text-gray-300">
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Conversazione continua (auto-ascolto)</span>
                  <input
                    type="checkbox"
                    checked={voiceSettings.continuousConversation}
                    onChange={(e) => {
                      const updated = { ...voiceSettings, continuousConversation: e.target.checked };
                      setVoiceSettings(updated);
                      voiceEngineRef.current?.updateSettings(updated);
                    }}
                    className="rounded accent-cyan-400"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span>Interruzione naturale (Barge-in con la voce)</span>
                  <input
                    type="checkbox"
                    checked={voiceSettings.bargeInEnabled}
                    onChange={(e) => {
                      const updated = { ...voiceSettings, bargeInEnabled: e.target.checked };
                      setVoiceSettings(updated);
                      voiceEngineRef.current?.updateSettings(updated);
                    }}
                    className="rounded accent-cyan-400"
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BOTTOM VOICE CONTROL DOCK (Minimalist & Thumb-friendly) */}
        <footer className="h-24 px-6 flex items-center justify-center border-t border-white/[0.08] bg-[#050507]/90 backdrop-blur-xl z-20">
          <div className="flex items-center space-x-3 sm:space-x-5">
            {/* Quick Settings button */}
            <button
              id="voice-settings-btn"
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className="p-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 hover:text-white transition-all hover:scale-105 active:scale-95"
              title="Opzioni voce"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Pause / Resume Listening */}
            <button
              id="voice-pause-btn"
              onClick={handleTogglePause}
              className="p-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 hover:text-white transition-all hover:scale-105 active:scale-95"
              title={isPaused ? 'Riprendi ascolto' : 'Pausa'}
            >
              {isPaused ? <Play className="w-5 h-5 text-cyan-400" /> : <Pause className="w-5 h-5" />}
            </button>

            {/* PRIMARY MICROPHONE BUTTON (Large, pulsating) */}
            <button
              id="voice-mic-main-btn"
              onClick={handleToggleMute}
              className={`relative p-5 rounded-full text-white transition-all shadow-2xl hover:scale-105 active:scale-95 ${
                isMuted
                  ? 'bg-red-600 hover:bg-red-500 shadow-red-900/50'
                  : orbState === 'listening'
                  ? 'bg-cyan-500 hover:bg-cyan-400 shadow-cyan-500/50'
                  : 'bg-white/20 hover:bg-white/30 shadow-white/20'
              }`}
              title={isMuted ? 'Riattiva microfono' : 'Disattiva microfono'}
            >
              {/* Pulsing ring when active */}
              {!isMuted && orbState === 'listening' && (
                <span className="absolute inset-0 rounded-full border-2 border-cyan-300 animate-ping opacity-75" />
              )}
              {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
            </button>

            {/* Stop AI speaking (Visible when answering) */}
            <button
              id="voice-stop-speech-btn"
              onClick={handleStopSpeaking}
              disabled={orbState !== 'speaking' && !isGenerating}
              className={`p-3 rounded-2xl border transition-all ${
                orbState === 'speaking' || isGenerating
                  ? 'bg-rose-950/60 hover:bg-rose-900/80 border-rose-500/50 text-rose-300 hover:scale-105 active:scale-95'
                  : 'bg-white/[0.03] border-white/[0.05] text-gray-600 cursor-not-allowed'
              }`}
              title="Interrompi risposta"
            >
              <Square className="w-5 h-5" />
            </button>

            {/* Switch to Text Button */}
            <button
              id="voice-exit-dock-btn"
              onClick={onClose}
              className="p-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 hover:text-white transition-all hover:scale-105 active:scale-95"
              title="Torna alla tastiera"
            >
              <Keyboard className="w-5 h-5" />
            </button>
          </div>
        </footer>
      </motion.div>
    </AnimatePresence>
  );
};
