import {
  Check,
  Edit2,
  LogOut,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Conversation, User } from '../types.js';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onDeleteConversation: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  currentUser: User | null;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  isOpen,
  onClose,
  onOpenSettings,
  onOpenAuth,
  currentUser,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.lastMessageSnippet && c.lastMessageSnippet.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const today: Conversation[] = [];
    const yesterday: Conversation[] = [];
    const last7Days: Conversation[] = [];
    const older: Conversation[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfLast7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;

    for (const conv of filteredConversations) {
      const convTime = new Date(conv.updatedAt || conv.createdAt).getTime();
      if (convTime >= startOfToday) {
        today.push(conv);
      } else if (convTime >= startOfYesterday) {
        yesterday.push(conv);
      } else if (convTime >= startOfLast7Days) {
        last7Days.push(conv);
      } else {
        older.push(conv);
      }
    }

    return {
      Oggi: today,
      Ieri: yesterday,
      'Ultimi 7 giorni': last7Days,
      Precedenti: older,
    };
  }, [filteredConversations]);

  const handleStartRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
    setMenuOpenId(null);
  };

  const handleSaveRename = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    onDeleteConversation(id);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-40 w-72 sm:w-[280px] bg-[#111111] border-r border-[#222222] flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white text-black flex items-center justify-center rounded-xl font-bold text-2xl shadow-[0_0_20px_rgba(255,255,255,0.2)] shrink-0">
              3
            </div>
            <span className="text-2xl font-light tracking-tight italic text-white">
              athlas
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="Chiudi barra laterale"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A1A] lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action: Nuova Chat */}
        <div className="px-5 py-2">
          <button
            id="new-chat-btn"
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 1024) onClose();
            }}
            className="w-full py-2.5 px-4 rounded-xl border border-[#333333] hover:bg-[#1A1A1A] text-gray-200 flex items-center justify-center gap-2 transition-all text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nuova chat</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-5 py-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
            <input
              id="sidebar-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca conversazioni..."
              className="w-full bg-[#1A1A1A] border border-[#222222] focus:border-[#444444] rounded-lg py-2 pl-9 pr-8 text-xs text-gray-300 placeholder-gray-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation List / Groups */}
        <div className="flex-1 overflow-y-auto px-4 space-y-5 py-2 select-none">
          {Object.entries(groupedConversations).map(([groupTitle, convList]) => {
            if (convList.length === 0) return null;

            return (
              <div key={groupTitle} className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2 px-1">
                  {groupTitle}
                </div>

                {convList.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  const isEditing = editingId === conv.id;

                  return (
                    <div
                      key={conv.id}
                      id={`conv-item-${conv.id}`}
                      onClick={() => {
                        onSelectConversation(conv.id);
                        if (window.innerWidth < 1024) onClose();
                      }}
                      className={`group relative flex items-center justify-between p-2 rounded-lg text-sm cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#1A1A1A] text-white border-l-2 border-white'
                          : 'text-gray-400 hover:bg-[#1A1A1A] hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                        <MessageSquare
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'
                          }`}
                        />

                        {isEditing ? (
                          <form
                            onSubmit={(e) => handleSaveRename(conv.id, e)}
                            className="flex items-center flex-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full bg-black px-2 py-0.5 rounded text-xs text-white border border-gray-600 focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="ml-1 p-1 text-white hover:text-gray-300"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <span className="truncate">{conv.title}</span>
                        )}
                      </div>

                      {/* Action Menu (Rename / Delete) */}
                      {!isEditing && (
                        <div
                          className="relative shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            id={`conv-menu-btn-${conv.id}`}
                            onClick={() =>
                              setMenuOpenId(menuOpenId === conv.id ? null : conv.id)
                            }
                            aria-label="Opzioni conversazione"
                            className={`p-1 rounded text-gray-500 hover:text-white hover:bg-[#222222] transition-opacity ${
                              isActive || menuOpenId === conv.id
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {menuOpenId === conv.id && (
                            <div className="absolute right-0 top-6 z-50 w-32 rounded-xl bg-[#141414] border border-[#262626] shadow-2xl py-1 text-xs text-gray-300">
                              <button
                                onClick={(e) => handleStartRename(conv, e)}
                                className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-[#222222] text-left transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                                <span>Rinomina</span>
                              </button>
                              <button
                                onClick={(e) => handleDelete(conv.id, e)}
                                className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-rose-500/20 text-rose-400 text-left transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Elimina</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {filteredConversations.length === 0 && (
            <div className="p-4 text-center text-xs text-gray-500 font-mono">
              {searchQuery ? 'Nessuna conversazione trovata' : 'Nessuna cronologia disponibile'}
            </div>
          )}
        </div>

        {/* Footer User & Settings Area */}
        <div className="p-4 border-t border-[#222222] bg-[#0E0E0E]">
          <div className="flex items-center justify-between">
            {currentUser ? (
              <div
                onClick={onOpenSettings}
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0 flex-1 mr-2"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-gray-700 to-gray-400 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 truncate">
                  <p className="text-sm font-medium text-gray-200 truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {currentUser.email || 'Account Utente'}
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-[#1A1A1A] hover:bg-[#222222] border border-[#333333] text-xs text-gray-200 flex-1 font-medium transition-colors"
              >
                <UserIcon className="w-4 h-4 text-gray-300" />
                <span>Accedi / Registrati</span>
              </button>
            )}

            <div className="flex items-center space-x-1">
              <button
                id="sidebar-settings-btn"
                onClick={onOpenSettings}
                aria-label="Impostazioni"
                title="Impostazioni piattaforma"
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#1A1A1A] transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>

              {currentUser && (
                <button
                  id="sidebar-logout-btn"
                  onClick={onLogout}
                  aria-label="Esci"
                  title="Disconnetti account"
                  className="p-2 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
