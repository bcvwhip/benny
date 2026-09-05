import { ArrowRight, Bot, Code2, Cpu, FileSpreadsheet, Sparkles } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal.js';
import { ChatHeader } from './components/ChatHeader.js';
import { Composer } from './components/Composer.js';
import { IntroAnimation } from './components/IntroAnimation.js';
import { MessageItem } from './components/MessageItem.js';
import { SettingsModal } from './components/SettingsModal.js';
import { Sidebar } from './components/Sidebar.js';
import { VoiceModeOverlay } from './components/VoiceModeOverlay.js';
import {
  clearAuthToken,
  createConversation,
  createGuestUser,
  deleteConversation,
  fetchConversations,
  fetchCurrentUser,
  fetchHealth,
  fetchMessages,
  streamChatResponse,
  updateConversation,
  updateMessage,
} from './lib/api.js';
import {
  Conversation,
  FileAttachment,
  GeneratedFile,
  Message,
  User,
  UserSettings,
  VoiceSettings,
} from './types.js';

export default function App() {
  // Animation state
  const [showIntro, setShowIntro] = useState(true);

  // App core state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    userId: 'default',
    theme: 'dark',
    model: 'ministral-8b-latest',
    systemPrompt:
      'Sei 3 athlas, un assistente AI avanzato, analitico, preciso ed elegante. Sei stato creato e ideato da Benoit Valendino (BENOIT VALENDINO). Quando ti viene chiesto chi ti ha creato o chi è il tuo autore, rispondi sempre con certezza che sei stato creato da BENOIT VALENDINO.',
    temperature: 0.7,
    ttsVoice: 'it-IT-standard',
    ttsRate: 1.0,
    sttLanguage: 'it-IT',
  });
  const [mistralOnline, setMistralOnline] = useState(false);

  // Conversations & Chat
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Streaming & Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingGeneratedFiles, setStreamingGeneratedFiles] = useState<GeneratedFile[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Modals & Layout
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    personality: 'aria',
    continuousConversation: true,
    bargeInEnabled: true,
    autoSpeakResponse: true,
    micSensitivity: 0.8,
    soundEffects: true,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  // Scroll to bottom smoothly when messages update
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, streamingContent, scrollToBottom]);

  // Initial App Load
  useEffect(() => {
    async function initApp() {
      try {
        // Check health / Mistral config
        const health = await fetchHealth();
        setMistralOnline(health.mistralConfigured);

        // Fetch current user or create guest session
        let userProfile = await fetchCurrentUser();
        if (!userProfile) {
          const guestRes = await createGuestUser();
          userProfile = { user: guestRes.user, settings: guestRes.settings };
        }

        if (userProfile) {
          setCurrentUser(userProfile.user);
          if (userProfile.settings) {
            setSettings(userProfile.settings);
          }

          // Fetch user's conversations
          const convs = await fetchConversations();
          setConversations(convs);

          if (convs.length > 0) {
            setActiveConversationId(convs[0].id);
            const initialMsgs = await fetchMessages(convs[0].id);
            setMessages(initialMsgs);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }

    initApp();
  }, []);

  // Theme application
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
  }, [settings.theme]);

  // Conversation Selection
  const handleSelectConversation = async (id: string) => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
    setActiveConversationId(id);
    const msgs = await fetchMessages(id);
    setMessages(msgs);
    setStreamingContent('');
    setStreamingMessageId(null);
  };

  // Create New Chat
  const handleNewChat = async () => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }

    try {
      const newConv = await createConversation('Nuova conversazione', settings.model);
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages([]);
      setStreamingContent('');
      setStreamingMessageId(null);
    } catch (err) {
      console.error('Error creating new chat, attempting recovery:', err);
      try {
        await createGuestUser();
        const newConv = await createConversation('Nuova conversazione', settings.model);
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        setMessages([]);
        setStreamingContent('');
        setStreamingMessageId(null);
      } catch (retryErr) {
        console.error('Error creating new chat after recovery:', retryErr);
      }
    }
  };

  // Rename Conversation
  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      const updated = await updateConversation(id, { title: newTitle });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
    } catch (err) {
      console.error('Error renaming conversation:', err);
    }
  };

  // Delete Conversation
  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);

      if (activeConversationId === id) {
        if (remaining.length > 0) {
          handleSelectConversation(remaining[0].id);
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  // Clear all history
  const handleClearAllHistory = async () => {
    for (const conv of conversations) {
      try {
        await deleteConversation(conv.id);
      } catch {
        // Continue
      }
    }
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setSettingsOpen(false);
  };

  // Stop Generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);

    // If there was streaming content, commit it as an assistant message
    if (streamingContent && streamingMessageId && activeConversationId) {
      const finalAssistantMsg: Message = {
        id: streamingMessageId,
        conversationId: activeConversationId,
        role: 'assistant',
        content: streamingContent,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, finalAssistantMsg]);
    }
    setStreamingContent('');
    setStreamingMessageId(null);
  };

  // Send Message with Real-Time Streaming
  const handleSendMessage = async (content: string, attachments: FileAttachment[] = []) => {
    let convId = activeConversationId;

    // If no active conversation, create one on the fly
    if (!convId) {
      try {
        const titleSnippet = content ? content.slice(0, 30) : 'Nuova conversazione';
        const newConv = await createConversation(titleSnippet, settings.model);
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        convId = newConv.id;
        if (!currentUser) {
          fetchCurrentUser().then((profile) => {
            if (profile) setCurrentUser(profile.user);
          });
        }
      } catch (err) {
        console.error('Failed to create conversation on send, attempting recovery:', err);
        try {
          await createGuestUser();
          const titleSnippet = content ? content.slice(0, 30) : 'Nuova conversazione';
          const newConv = await createConversation(titleSnippet, settings.model);
          setConversations((prev) => [newConv, ...prev]);
          setActiveConversationId(newConv.id);
          convId = newConv.id;
        } catch (retryErr) {
          console.error('Failed to create conversation on send after recovery:', retryErr);
          return;
        }
      }
    }

    // Add User message immediately to UI
    const tempUserMsgId = `msg_${Date.now()}_usr`;
    const userMsg: Message = {
      id: tempUserMsgId,
      conversationId: convId,
      role: 'user',
      content,
      attachments,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);
    setStreamingContent('');
    setStreamingGeneratedFiles([]);

    const tempAssistantMsgId = `msg_${Date.now()}_ast`;
    setStreamingMessageId(tempAssistantMsgId);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let fullStreamText = '';
    const currentReceivedFiles: GeneratedFile[] = [];

    await streamChatResponse(
      {
        conversationId: convId,
        content,
        attachments,
        modelOverride: settings.model,
      },
      (delta) => {
        fullStreamText += delta;
        setStreamingContent(fullStreamText);
      },
      (errorMsg) => {
        fullStreamText = errorMsg;
        setStreamingContent(errorMsg);
        setIsGenerating(false);
      },
      (finalText) => {
        setIsGenerating(false);
        const resolvedText = finalText || fullStreamText;

        if (resolvedText.trim()) {
          const finalMsg: Message = {
            id: tempAssistantMsgId,
            conversationId: convId!,
            role: 'assistant',
            content: resolvedText,
            generatedFiles: currentReceivedFiles.length > 0 ? currentReceivedFiles : undefined,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, finalMsg]);
        }

        setStreamingContent('');
        setStreamingMessageId(null);
        setStreamingGeneratedFiles([]);
        abortControllerRef.current = null;

        // Refresh conversation messages and list
        fetchMessages(convId!).then((latestMsgs) => {
          if (latestMsgs && latestMsgs.length > 0) {
            setMessages(latestMsgs);
          }
        });
        fetchConversations().then(setConversations);
      },
      (file) => {
        currentReceivedFiles.push(file);
        setStreamingGeneratedFiles((prev) => [...prev, file]);
      },
      controller.signal
    );
  };

  // Regenerate Response
  const handleRegenerateMessage = async (assistantMsgId: string) => {
    if (!activeConversationId || isGenerating) return;

    // Remove this assistant message and subsequent messages
    const targetIdx = messages.findIndex((m) => m.id === assistantMsgId);
    if (targetIdx === -1) return;

    const trimmedMessages = messages.slice(0, targetIdx);
    setMessages(trimmedMessages);

    setIsGenerating(true);
    setStreamingContent('');
    setStreamingGeneratedFiles([]);

    const newAssistantMsgId = `msg_${Date.now()}_ast`;
    setStreamingMessageId(newAssistantMsgId);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let fullStreamText = '';
    const currentReceivedFiles: GeneratedFile[] = [];

    await streamChatResponse(
      {
        conversationId: activeConversationId,
        regenerateMessageId: assistantMsgId,
        modelOverride: settings.model,
      },
      (delta) => {
        fullStreamText += delta;
        setStreamingContent(fullStreamText);
      },
      (errorMsg) => {
        setStreamingContent(errorMsg);
        setIsGenerating(false);
      },
      (finalText) => {
        setIsGenerating(false);
        if (finalText.trim()) {
          const finalMsg: Message = {
            id: newAssistantMsgId,
            conversationId: activeConversationId,
            role: 'assistant',
            content: finalText,
            generatedFiles: currentReceivedFiles.length > 0 ? currentReceivedFiles : undefined,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, finalMsg]);
        }
        setStreamingContent('');
        setStreamingMessageId(null);
        setStreamingGeneratedFiles([]);
        abortControllerRef.current = null;

        fetchMessages(activeConversationId).then((latestMsgs) => {
          if (latestMsgs && latestMsgs.length > 0) {
            setMessages(latestMsgs);
          }
        });
      },
      (file) => {
        currentReceivedFiles.push(file);
        setStreamingGeneratedFiles((prev) => [...prev, file]);
      },
      controller.signal
    );
  };

  // Edit Message
  const handleEditMessage = async (userMsgId: string, updatedContent: string) => {
    if (!activeConversationId || isGenerating) return;

    const targetIdx = messages.findIndex((m) => m.id === userMsgId);
    if (targetIdx === -1) return;

    // Update user message content and remove anything after it
    const updatedUserMsg = { ...messages[targetIdx], content: updatedContent };
    const trimmed = [...messages.slice(0, targetIdx), updatedUserMsg];
    setMessages(trimmed);

    setIsGenerating(true);
    setStreamingContent('');
    setStreamingGeneratedFiles([]);

    const newAssistantMsgId = `msg_${Date.now()}_ast`;
    setStreamingMessageId(newAssistantMsgId);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let fullStreamText = '';
    const currentReceivedFiles: GeneratedFile[] = [];

    await streamChatResponse(
      {
        conversationId: activeConversationId,
        content: updatedContent,
        editMessageId: userMsgId,
        modelOverride: settings.model,
      },
      (delta) => {
        fullStreamText += delta;
        setStreamingContent(fullStreamText);
      },
      (errorMsg) => {
        setStreamingContent(errorMsg);
        setIsGenerating(false);
      },
      (finalText) => {
        setIsGenerating(false);
        if (finalText.trim()) {
          const finalMsg: Message = {
            id: newAssistantMsgId,
            conversationId: activeConversationId,
            role: 'assistant',
            content: finalText,
            generatedFiles: currentReceivedFiles.length > 0 ? currentReceivedFiles : undefined,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, finalMsg]);
        }
        setStreamingContent('');
        setStreamingMessageId(null);
        setStreamingGeneratedFiles([]);
        abortControllerRef.current = null;

        fetchMessages(activeConversationId).then((latestMsgs) => {
          if (latestMsgs && latestMsgs.length > 0) {
            setMessages(latestMsgs);
          }
        });
      },
      (file) => {
        currentReceivedFiles.push(file);
        setStreamingGeneratedFiles((prev) => [...prev, file]);
      },
      controller.signal
    );
  };

  // Message Rating
  const handleRateMessage = async (messageId: string, rating: 1 | -1 | 0) => {
    try {
      await updateMessage(messageId, { rating });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, rating } : m))
      );
    } catch (err) {
      console.error('Error rating message:', err);
    }
  };

  // Model Selection
  const handleSelectModel = (newModel: string) => {
    setSettings((prev) => ({ ...prev, model: newModel }));
    if (activeConversationId) {
      updateConversation(activeConversationId, { model: newModel });
    }
  };

  // Logout
  const handleLogout = async () => {
    clearAuthToken();
    setCurrentUser(null);
    setSettingsOpen(false);

    // Recreate a clean guest session
    try {
      const guestRes = await createGuestUser();
      setCurrentUser(guestRes.user);
      setSettings(guestRes.settings);
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
    } catch {
      // Ignored
    }
  };

  // Quick Starter Prompts
  const starterPrompts = [
    {
      icon: <Code2 className="w-4 h-4 text-gray-300" />,
      title: 'Analisi Codice & Debug',
      prompt: 'Analizza e ottimizza questo algoritmo per ridurre la complessità computazionale a O(n).',
    },
    {
      icon: <FileSpreadsheet className="w-4 h-4 text-gray-300" />,
      title: 'Elaborazione Dati CSV / File',
      prompt: 'Come posso strutturare ed estrarre metriche chiave da un file CSV contenente transazioni?',
    },
    {
      icon: <Cpu className="w-4 h-4 text-gray-300" />,
      title: 'Architettura Software',
      prompt: 'Spiega i vantaggi e svantaggi di una architettura a microservizi rispetto a un monolito modulare.',
    },
    {
      icon: <Sparkles className="w-4 h-4 text-gray-300" />,
      title: 'Ragionamento Complesso',
      prompt: 'Spiega in modo chiaro e approfondito il principio di indeterminazione di Heisenberg.',
    },
  ];

  return (
    <div className="relative flex h-screen w-full bg-[#0A0A0A] text-[#E5E5E5] overflow-hidden select-text font-['Plus_Jakarta_Sans']">
      {/* 1. Introductory Animation (1-1.5s) */}
      {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}

      {/* 2. Left Sidebar (Desktop & Mobile Drawer) */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* 3. Main Chat Container */}
      <main className="flex-1 flex flex-col h-full min-w-0 lg:ml-72 sm:lg:ml-[280px] bg-[#0A0A0A] relative">
        {/* Top Header */}
        <ChatHeader
          currentModel={settings.model}
          onSelectModel={handleSelectModel}
          mistralOnline={mistralOnline}
          onOpenSidebar={() => setSidebarOpen(true)}
          onNewChat={handleNewChat}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenVoiceMode={() => setIsVoiceModeOpen(true)}
          currentUser={currentUser}
          settings={settings}
        />

        {/* Message Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 space-y-4">
          {/* Welcome Screen when conversation has no messages */}
          {messages.length === 0 && !streamingContent && (
            <div className="h-full min-h-[460px] flex flex-col items-center justify-center max-w-2xl mx-auto text-center px-4 animate-fadeIn">
              {/* Distinctive 3 athlas Brandmark */}
              <div className="relative mb-6 flex items-center justify-center">
                <div className="absolute -inset-4 rounded-3xl bg-white/5 blur-xl pointer-events-none" />
                <div className="relative w-16 h-16 rounded-2xl bg-white text-black flex items-center justify-center font-bold text-3xl shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                  3
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-white mb-2">
                <span className="font-bold not-italic">3</span> <span className="italic">athlas</span> <span className="text-gray-400 text-xl sm:text-2xl font-normal not-italic">intelligence</span>
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 max-w-md mb-8 leading-relaxed">
                Piattaforma AI conversazionale alimentata da Mistral AI. Invia un messaggio, allega un file o usa la voce per iniziare.
              </p>

              {/* Quick Starter Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                {starterPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(p.prompt)}
                    className="p-3.5 rounded-xl bg-[#111111] border border-[#222222] hover:border-[#444444] hover:bg-[#161616] transition-all group shadow-sm text-left flex flex-col justify-between"
                  >
                    <div className="flex items-center space-x-2.5 mb-2">
                      <div className="p-1.5 rounded-lg bg-[#1A1A1A] group-hover:bg-[#222222] transition-colors">
                        {p.icon}
                      </div>
                      <span className="text-xs font-semibold text-gray-200 group-hover:text-white">
                        {p.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                      {p.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render Actual Messages */}
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              onRegenerate={msg.role === 'assistant' ? handleRegenerateMessage : undefined}
              onEdit={msg.role === 'user' ? handleEditMessage : undefined}
              onRate={msg.role === 'assistant' ? handleRateMessage : undefined}
            />
          ))}

          {/* Active Streaming Message Preview */}
          {isGenerating && streamingContent && (
            <MessageItem
              message={{
                id: streamingMessageId || 'streaming_placeholder',
                conversationId: activeConversationId || '',
                role: 'assistant',
                content: streamingContent,
                generatedFiles: streamingGeneratedFiles,
                createdAt: new Date().toISOString(),
              }}
              isStreaming={true}
            />
          )}

          {/* Loading Indicator while waiting for first chunk */}
          {isGenerating && !streamingContent && (
            <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 py-4 flex items-center space-x-3 text-gray-400 text-xs font-mono animate-pulse">
              <div className="w-7 h-7 rounded-lg bg-[#1A1A1A] border border-[#333333] flex items-center justify-center">
                <Bot className="w-4 h-4 text-gray-200 animate-spin" />
              </div>
              <span>3 athlas sta elaborando la risposta con Mistral AI...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 4. Bottom Composer Input Area */}
        <Composer
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          onStopGeneration={handleStopGeneration}
          conversationId={activeConversationId || undefined}
          sttLanguage={settings.sttLanguage}
          onOpenVoiceMode={() => setIsVoiceModeOpen(true)}
        />
      </main>

      {/* 5. Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentUser={currentUser}
        settings={settings}
        onUpdateSettings={(newSettings) => setSettings(newSettings)}
        onLogout={handleLogout}
        onClearAllHistory={handleClearAllHistory}
      />

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthSuccess={(authData) => {
          setCurrentUser(authData.user);
          setSettings(authData.settings);
          fetchConversations().then(setConversations);
        }}
      />

      {/* 6. Immersive 3 Athlas Next-Gen Voice Mode (3D Dynamic Orb, VAD, Barge-In, Continuous Conversation) */}
      <VoiceModeOverlay
        isOpen={isVoiceModeOpen}
        onClose={() => setIsVoiceModeOpen(false)}
        activeConversation={conversations.find((c) => c.id === activeConversationId) || null}
        messages={messages}
        isGenerating={isGenerating}
        streamingContent={streamingContent}
        onSendMessage={async (text) => {
          await handleSendMessage(text, []);
        }}
        onNewConversation={handleNewChat}
        initialVoiceSettings={voiceSettings}
        onUpdateVoiceSettings={(newVoiceSettings) => setVoiceSettings(newVoiceSettings)}
      />
    </div>
  );
}
