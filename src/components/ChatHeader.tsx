import { ChevronDown, Menu, Mic, Plus, Settings, Sparkles, User as UserIcon } from 'lucide-react';
import React, { useState } from 'react';
import { AVAILABLE_MISTRAL_MODELS } from '../server/mistral.js';
import { User, UserSettings } from '../types.js';

interface ChatHeaderProps {
  currentModel: string;
  onSelectModel: (model: string) => void;
  mistralOnline: boolean;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  onOpenVoiceMode?: () => void;
  currentUser: User | null;
  settings: UserSettings;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  currentModel,
  onSelectModel,
  mistralOnline,
  onOpenSidebar,
  onNewChat,
  onOpenSettings,
  onOpenAuth,
  onOpenVoiceMode,
  currentUser,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const selectedModelObj =
    AVAILABLE_MISTRAL_MODELS.find((m) => m.id === currentModel) || AVAILABLE_MISTRAL_MODELS[0];

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-4 sm:px-8 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-[#222222]">
      {/* Left controls: Mobile Menu + Model Dropdown + SSL Status */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Mobile menu trigger */}
        <button
          id="mobile-menu-toggle"
          onClick={onOpenSidebar}
          aria-label="Apri menu laterale"
          className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#1A1A1A] lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile new chat shortcut */}
        <button
          onClick={onNewChat}
          aria-label="Nuova chat"
          className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#1A1A1A] lg:hidden"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Model Selector Dropdown */}
        <div className="relative">
          <button
            id="model-selector-btn"
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-[#333333] hover:bg-[#1A1A1A] text-xs text-gray-300 transition-all font-medium"
          >
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-semibold uppercase tracking-widest text-[11px] text-gray-300">
              {selectedModelObj.name}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </button>

          {modelDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setModelDropdownOpen(false)}
              />
              <div className="absolute left-0 top-10 z-50 w-64 rounded-2xl bg-[#111111] border border-[#222222] shadow-2xl p-1.5 space-y-1 animate-fadeIn">
                <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222222] mb-1">
                  Modelli Mistral AI Disponibili
                </div>
                {AVAILABLE_MISTRAL_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setModelDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-xl text-xs transition-colors flex flex-col ${
                      m.id === currentModel
                        ? 'bg-[#1A1A1A] text-white font-semibold border border-[#333333]'
                        : 'text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{m.name}</span>
                      {m.id === currentModel && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 font-normal font-sans">
                      {m.desc}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status indicator & SSL divider */}
        <div className="hidden sm:flex items-center space-x-3 text-xs text-gray-500">
          <div className="h-4 w-[1px] bg-[#222222]" />
          <span>
            {mistralOnline ? 'Connessione protetta via SSL' : 'Chiave API Richiesta'}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {currentUser ? (
          <button
            id="header-user-btn"
            onClick={onOpenSettings}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-full border border-[#333333] hover:bg-[#1A1A1A] text-xs text-gray-300 transition-colors"
          >
            <div className="w-5 h-5 rounded-full bg-gray-700 text-gray-200 flex items-center justify-center font-bold text-[10px]">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden md:inline font-medium max-w-[120px] truncate">
              {currentUser.name}
            </span>
          </button>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white text-black hover:bg-gray-200 text-xs font-semibold transition-colors"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Accedi</span>
          </button>
        )}

        {/* Voice Mode Button */}
        {onOpenVoiceMode && (
          <button
            id="header-voice-mode-btn"
            onClick={onOpenVoiceMode}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-semibold shadow-lg shadow-cyan-950/30 transition-all hover:scale-105 active:scale-95"
            title="Avvia modalità vocale immersiva con Orbe 3D"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <Mic className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Voce 3 athlas</span>
          </button>
        )}

        <button
          id="header-settings-btn"
          onClick={onOpenSettings}
          aria-label="Impostazioni"
          title="Impostazioni piattaforma"
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#1A1A1A] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
