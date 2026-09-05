import {
  Brain,
  Check,
  Database,
  Eye,
  Key,
  Lock,
  LogOut,
  Mic,
  Moon,
  Shield,
  Sun,
  Trash2,
  User,
  Volume2,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { deleteFile, fetchFiles, updateUserSettings } from '../lib/api.js';
import { speakText } from '../lib/audio.js';
import { VOICE_PERSONALITIES } from '../lib/voiceEngine.js';
import { AVAILABLE_MISTRAL_MODELS } from '../server/mistral.js';
import { FileAttachment, User as UserType, UserSettings, VoicePersonalityId } from '../types.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType | null;
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
  onLogout: () => void;
  onClearAllHistory: () => void;
}

type TabType = 'account' | 'appearance' | 'ai' | 'voice' | 'privacy' | 'data';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  settings,
  onUpdateSettings,
  onLogout,
  onClearAllHistory,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('ai');

  // Form state
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(settings.theme || 'dark');
  const [model, setModel] = useState(settings.model || 'ministral-8b-latest');
  const [temperature, setTemperature] = useState(settings.temperature ?? 0.7);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt || '');
  const [apiKeyOverride, setApiKeyOverride] = useState(settings.mistralApiKeyOverride || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [sttLang, setSttLang] = useState(settings.sttLanguage || 'it-IT');
  const [ttsRate, setTtsRate] = useState(settings.ttsRate ?? 1.0);

  // Files tab state
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Save feedback
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && activeTab === 'data') {
      setIsLoadingFiles(true);
      fetchFiles()
        .then(setFiles)
        .finally(() => setIsLoadingFiles(false));
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      const updated = await updateUserSettings({
        theme,
        model,
        temperature,
        systemPrompt,
        mistralApiKeyOverride: apiKeyOverride.trim() || undefined,
        sttLanguage: sttLang,
        ttsRate,
      });
      onUpdateSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  const handleTestTTS = () => {
    speakText('Ciao! Questo è un test di sintesi vocale per 3 athlas.', ttsRate, sttLang);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#111111] border border-[#222222] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222222] bg-[#141414]">
          <div className="flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-md bg-white text-black flex items-center justify-center font-bold text-xs">
              <span>3</span>
            </div>
            <h2 className="font-semibold text-base text-white">Impostazioni Piattaforma</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#1E1E1E] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Tabs Layout */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Tabs Sidebar */}
          <div className="w-full md:w-48 bg-[#0E0E0E] border-b md:border-b-0 md:border-r border-[#222222] p-2 flex md:flex-col overflow-x-auto gap-1">
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'ai'
                  ? 'bg-[#1C1C1C] text-white border border-[#2E2E2E]'
                  : 'text-gray-400 hover:text-white hover:bg-[#141414]'
              }`}
            >
              <Brain className="w-4 h-4" />
              <span>Motore AI</span>
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'appearance'
                  ? 'bg-[#1C1C1C] text-white border border-[#2E2E2E]'
                  : 'text-gray-400 hover:text-white hover:bg-[#141414]'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>Aspetto</span>
            </button>

            <button
              onClick={() => setActiveTab('voice')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'voice'
                  ? 'bg-[#1C1C1C] text-white border border-[#2E2E2E]'
                  : 'text-gray-400 hover:text-white hover:bg-[#141414]'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Voce</span>
            </button>

            <button
              onClick={() => setActiveTab('account')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'account'
                  ? 'bg-[#1C1C1C] text-white border border-[#2E2E2E]'
                  : 'text-gray-400 hover:text-white hover:bg-[#141414]'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Account</span>
            </button>

            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'data'
                  ? 'bg-[#1C1C1C] text-white border border-[#2E2E2E]'
                  : 'text-gray-400 hover:text-white hover:bg-[#141414]'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Dati & File</span>
            </button>

            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'privacy'
                  ? 'bg-[#1C1C1C] text-white border border-[#2E2E2E]'
                  : 'text-gray-400 hover:text-white hover:bg-[#141414]'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Privacy</span>
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 p-5 overflow-y-auto space-y-5 text-sm text-gray-200 bg-[#111111]">
            {/* AI TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-mono">
                    Modello Mistral AI
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#282828] text-gray-100 text-xs focus:outline-none focus:border-white transition-colors"
                  >
                    {AVAILABLE_MISTRAL_MODELS.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#161616] text-gray-100">
                        {m.name} ({m.id}) — {m.desc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-mono">
                      Temperatura: {temperature}
                    </label>
                    <span className="text-[11px] text-gray-500 font-mono">
                      {temperature < 0.4 ? 'Deterministico' : temperature > 0.8 ? 'Creativo' : 'Bilanciato'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-mono">
                    System Prompt Personalizzato
                  </label>
                  <textarea
                    rows={3}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Definisci il comportamento dell'assistente 3 athlas..."
                    className="w-full p-2.5 text-xs rounded-xl bg-[#161616] border border-[#282828] text-gray-100 focus:outline-none focus:border-white resize-none font-mono"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[#161616] border border-[#282828] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Key className="w-4 h-4 text-gray-300" />
                      <span className="text-xs font-semibold text-gray-200">Mistral API Key Override</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-gray-400 hover:text-white"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Se non hai configurato `MISTRAL_API_KEY` nel file `.env`, puoi specificare la tua chiave qui. Rimane protetta e salvata nel database dell&apos;applicazione.
                  </p>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyOverride}
                    onChange={(e) => setApiKeyOverride(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-1.5 rounded-lg bg-[#0F0F0F] border border-[#2A2A2A] text-xs font-mono text-gray-200 focus:outline-none focus:border-white"
                  />
                </div>
              </div>
            )}

            {/* APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 font-mono">
                  Tema Interfaccia
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex flex-col items-center p-3 rounded-xl border transition-all ${
                      theme === 'dark'
                        ? 'bg-[#1C1C1C] border-white text-white'
                        : 'bg-[#161616] border-[#262626] text-gray-400 hover:text-white'
                    }`}
                  >
                    <Moon className="w-5 h-5 mb-1.5 text-white" />
                    <span className="text-xs font-medium">Dark Mode</span>
                    <span className="text-[10px] text-gray-500">Predefinito</span>
                  </button>

                  <button
                    onClick={() => setTheme('light')}
                    className={`flex flex-col items-center p-3 rounded-xl border transition-all ${
                      theme === 'light'
                        ? 'bg-[#1C1C1C] border-white text-white'
                        : 'bg-[#161616] border-[#262626] text-gray-400 hover:text-white'
                    }`}
                  >
                    <Sun className="w-5 h-5 mb-1.5 text-amber-400" />
                    <span className="text-xs font-medium">Light Mode</span>
                    <span className="text-[10px] text-gray-500">Luminoso</span>
                  </button>

                  <button
                    onClick={() => setTheme('system')}
                    className={`flex flex-col items-center p-3 rounded-xl border transition-all ${
                      theme === 'system'
                        ? 'bg-[#1C1C1C] border-white text-white'
                        : 'bg-[#161616] border-[#262626] text-gray-400 hover:text-white'
                    }`}
                  >
                    <Brain className="w-5 h-5 mb-1.5 text-gray-400" />
                    <span className="text-xs font-medium">Sistema</span>
                    <span className="text-[10px] text-gray-500">Auto OS</span>
                  </button>
                </div>
              </div>
            )}

            {/* VOICE TAB */}
            {activeTab === 'voice' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 font-mono">
                    Lingua Riconoscimento Vocale (Speech-to-Text)
                  </label>
                  <select
                    value={sttLang}
                    onChange={(e) => setSttLang(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#161616] border border-[#282828] text-gray-100 text-xs focus:outline-none focus:border-white"
                  >
                    <option value="it-IT">Italiano (Italia)</option>
                    <option value="en-US">English (US)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="es-ES">Español</option>
                    <option value="fr-FR">Français</option>
                    <option value="de-DE">Deutsch</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-mono">
                      Velocità Sintesi Vocale (TTS): {ttsRate}x
                    </label>
                    <button
                      type="button"
                      onClick={handleTestTTS}
                      className="text-xs text-gray-300 hover:text-white underline flex items-center space-x-1"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Ascolta prova</span>
                    </button>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.5"
                    step="0.05"
                    value={ttsRate}
                    onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                    className="w-full accent-white"
                  />
                </div>

                {/* 4 Voice Personalities Showcase */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 font-mono">
                    Personalità Vocali 3 Athlas
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(Object.keys(VOICE_PERSONALITIES) as VoicePersonalityId[]).map((pId) => {
                      const p = VOICE_PERSONALITIES[pId];
                      return (
                        <div
                          key={pId}
                          className="p-3 rounded-xl bg-[#161616] border border-[#282828] flex flex-col justify-between space-y-2"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: p.color }}
                                />
                                <span className="text-xs font-semibold text-white">{p.name}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  speakText(
                                    `Ciao, sono ${p.name}. ${p.tagline} per 3 athlas.`,
                                    p.rate * ttsRate,
                                    sttLang
                                  );
                                }}
                                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
                              >
                                <Volume2 className="w-3 h-3" />
                                <span>Ascolta</span>
                              </button>
                            </div>
                            <span className="text-[11px] text-gray-300 block mt-0.5">{p.tagline}</span>
                            <span className="text-[10px] text-gray-500 block leading-tight mt-1">
                              {p.description}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ACCOUNT TAB */}
            {activeTab === 'account' && (
              <div className="space-y-4">
                {currentUser ? (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-[#161616] border border-[#282828] space-y-1">
                      <div className="text-xs text-gray-400">Nome utente</div>
                      <div className="text-sm font-semibold text-white">{currentUser.name}</div>
                      <div className="text-xs text-gray-400 pt-2">Indirizzo Email</div>
                      <div className="text-sm font-semibold text-white">{currentUser.email}</div>
                      <div className="text-xs text-gray-400 pt-2">ID Account</div>
                      <div className="text-xs font-mono text-gray-300">{currentUser.id}</div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={onLogout}
                        className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Disconnetti account</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-[#161616] border border-[#282828] text-center space-y-2">
                    <p className="text-xs text-gray-400">
                      Stai utilizzando una sessione temporanea (ospite). Registrati per sincronizzare le tue conversazioni su tutti i tuoi dispositivi.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* DATA TAB */}
            {activeTab === 'data' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-mono">
                    File Caricati ({files.length})
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">
                    Spazio: {(files.reduce((a, b) => a + b.size, 0) / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>

                {isLoadingFiles ? (
                  <div className="p-4 text-center text-xs text-gray-400">Caricamento file...</div>
                ) : files.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#161616] border border-[#282828] text-center text-xs text-gray-400">
                    Nessun file caricato nelle conversazioni.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#161616] border border-[#282828] text-xs"
                      >
                        <div className="truncate mr-2">
                          <div className="font-medium text-gray-200 truncate">{file.originalName}</div>
                          <div className="text-[10px] text-gray-500 font-mono">
                            {(file.size / 1024).toFixed(1)} KB • {file.mimeType}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1.5 rounded text-gray-400 hover:text-rose-400 hover:bg-[#222222] transition-colors"
                          title="Elimina file dal server"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PRIVACY TAB */}
            {activeTab === 'privacy' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#161616] border border-[#282828] text-xs text-gray-300 leading-relaxed">
                  <h4 className="font-semibold text-white mb-1">Protezione dei Dati 3 athlas</h4>
                  Tutte le conversazioni sono isolate per account tramite autenticazione con hash crittografico e token JWT. I file caricati risiedono in archiviazione server protetta e sono accessibili esclusivamente dalle tue sessioni.
                </div>

                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <div className="text-xs font-semibold text-rose-300">Eliminazione Completa Cronologia</div>
                  <p className="text-[11px] text-rose-400/80">
                    Questa operazione cancellerà in modo permanente tutte le tue conversazioni, messaggi e file associati.
                  </p>
                  <button
                    onClick={onClearAllHistory}
                    className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs transition-colors"
                  >
                    Cancella Tutta la Cronologia
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[#222222] bg-[#141414]">
          {saveSuccess ? (
            <div className="flex items-center space-x-1 text-emerald-400 text-xs font-semibold">
              <Check className="w-4 h-4" />
              <span>Impostazioni salvate con successo!</span>
            </div>
          ) : (
            <div className="text-[11px] text-gray-500 font-mono">
              3 athlas v1.0.4 • Mistral Core
            </div>
          )}

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs rounded-xl bg-[#1C1C1C] text-gray-300 hover:bg-[#252525] border border-[#2A2A2A] transition-colors"
            >
              Chiudi
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-xs rounded-xl bg-white text-black font-semibold hover:bg-gray-200 shadow-sm transition-all"
            >
              Salva modifiche
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
