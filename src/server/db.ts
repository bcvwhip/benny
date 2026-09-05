import fs from 'fs';
import path from 'path';
import {
  Conversation,
  FileAttachment,
  GeneratedFile,
  GeneratedImage,
  Message,
  User,
  UserSettings,
} from '../types.js';

interface DBUser extends User {
  passwordHash: string;
}

export interface DBGeneratedFile extends GeneratedFile {
  userId: string;
  conversationId?: string;
  messageId?: string;
  filePath: string;
}

export interface DBGeneratedImage extends GeneratedImage {
  userId: string;
  filePath: string;
}

interface DatabaseSchema {
  users: DBUser[];
  conversations: Conversation[];
  messages: Message[];
  files: (FileAttachment & { userId: string; conversationId?: string })[];
  generated_files?: DBGeneratedFile[];
  generated_images?: DBGeneratedImage[];
  user_settings: Record<string, UserSettings>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export const DEFAULT_ATHLAS_SYSTEM_PROMPT =
  'Sei 3 athlas, un assistente AI avanzato, analitico, preciso ed elegante. Sei stato creato e ideato da Benoit Valendino (BENOIT VALENDINO). Quando ti viene chiesto chi ti ha creato, chi è il tuo autore, sviluppatore, creatore o inventore, rispondi sempre con fierezza e chiarezza affermando che sei stato creato da BENOIT VALENDINO.';

class PersistentDatabase {
  private data: DatabaseSchema = {
    users: [],
    conversations: [],
    messages: [],
    files: [],
    user_settings: {},
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        // Ensure all arrays exist
        this.data.users = this.data.users || [];
        this.data.conversations = this.data.conversations || [];
        this.data.messages = this.data.messages || [];
        this.data.files = this.data.files || [];
        this.data.user_settings = this.data.user_settings || {};

        // Sanitize models: auto-migrate any mistral-large-latest to ministral-8b-latest
        // to avoid subscription tier errors on free/standard API accounts
        let needsSave = false;
        for (const conv of this.data.conversations) {
          if (conv.model === 'mistral-large-latest' || conv.model === 'open-mistral-7b') {
            conv.model = 'ministral-8b-latest';
            needsSave = true;
          }
        }
        for (const uid of Object.keys(this.data.user_settings)) {
          const setting = this.data.user_settings[uid];
          if (
            setting.model === 'mistral-large-latest' ||
            setting.model === 'open-mistral-7b'
          ) {
            setting.model = 'ministral-8b-latest';
            needsSave = true;
          }
          // Enforce Benoit Valendino identity in systemPrompt
          if (
            !setting.systemPrompt ||
            setting.systemPrompt === 'Sei 3 athlas, un assistente AI avanzato, preciso, analitico e professionale.' ||
            !setting.systemPrompt.toLowerCase().includes('benoit valendino')
          ) {
            setting.systemPrompt = DEFAULT_ATHLAS_SYSTEM_PROMPT;
            needsSave = true;
          }
        }
        if (needsSave) {
          this.save();
        }
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Error initializing database:', err);
    }
  }

  private save() {
    try {
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('Error saving database to disk:', err);
    }
  }

  // --- Users ---
  findUserByEmail(email: string): DBUser | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string): DBUser | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  createUser(user: DBUser): DBUser {
    this.data.users.push(user);
    this.save();
    return user;
  }

  updateUser(id: string, updates: Partial<DBUser>): DBUser | undefined {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return undefined;
    this.data.users[idx] = { ...this.data.users[idx], ...updates };
    this.save();
    return this.data.users[idx];
  }

  // --- Settings ---
  getUserSettings(userId: string): UserSettings {
    if (!this.data.user_settings[userId]) {
      this.data.user_settings[userId] = {
        userId,
        theme: 'dark',
        model:
          process.env.MISTRAL_MODEL && process.env.MISTRAL_MODEL !== 'mistral-large-latest'
            ? process.env.MISTRAL_MODEL
            : 'ministral-8b-latest',
        systemPrompt: DEFAULT_ATHLAS_SYSTEM_PROMPT,
        temperature: 0.7,
        ttsVoice: 'it-IT-standard',
        ttsRate: 1.0,
        sttLanguage: 'it-IT',
      };
      this.save();
    }
    return this.data.user_settings[userId];
  }

  updateUserSettings(userId: string, updates: Partial<UserSettings>): UserSettings {
    const current = this.getUserSettings(userId);
    this.data.user_settings[userId] = { ...current, ...updates };
    this.save();
    return this.data.user_settings[userId];
  }

  // --- Conversations ---
  getConversations(userId: string): Conversation[] {
    return this.data.conversations
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  getConversationById(id: string, userId: string): Conversation | undefined {
    return this.data.conversations.find((c) => c.id === id && c.userId === userId);
  }

  createConversation(conv: Conversation): Conversation {
    this.data.conversations.unshift(conv);
    this.save();
    return conv;
  }

  updateConversation(
    id: string,
    userId: string,
    updates: Partial<Conversation>
  ): Conversation | undefined {
    const idx = this.data.conversations.findIndex((c) => c.id === id && c.userId === userId);
    if (idx === -1) return undefined;
    this.data.conversations[idx] = {
      ...this.data.conversations[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.conversations[idx];
  }

  deleteConversation(id: string, userId: string): boolean {
    const initialLen = this.data.conversations.length;
    this.data.conversations = this.data.conversations.filter(
      (c) => !(c.id === id && c.userId === userId)
    );
    if (this.data.conversations.length !== initialLen) {
      // Cascade delete messages and file references
      this.data.messages = this.data.messages.filter((m) => m.conversationId !== id);
      this.save();
      return true;
    }
    return false;
  }

  // --- Messages ---
  getMessages(conversationId: string): Message[] {
    return this.data.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  getMessageById(id: string): Message | undefined {
    return this.data.messages.find((m) => m.id === id);
  }

  createMessage(msg: Message): Message {
    this.data.messages.push(msg);

    // Update conversation updatedAt & last message snippet
    const conv = this.data.conversations.find((c) => c.id === msg.conversationId);
    if (conv) {
      conv.updatedAt = new Date().toISOString();
      conv.lastMessageSnippet = msg.content.slice(0, 100);
    }

    this.save();
    return msg;
  }

  updateMessage(id: string, updates: Partial<Message>): Message | undefined {
    const idx = this.data.messages.findIndex((m) => m.id === id);
    if (idx === -1) return undefined;
    this.data.messages[idx] = {
      ...this.data.messages[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.messages[idx];
  }

  deleteMessagesAfter(conversationId: string, messageId: string): void {
    const messages = this.getMessages(conversationId);
    const targetIdx = messages.findIndex((m) => m.id === messageId);
    if (targetIdx !== -1) {
      const idsToRemove = new Set(messages.slice(targetIdx + 1).map((m) => m.id));
      this.data.messages = this.data.messages.filter((m) => !idsToRemove.has(m.id));
      this.save();
    }
  }

  // --- Files ---
  createFileRecord(file: FileAttachment & { userId: string; conversationId?: string }) {
    this.data.files.push(file);
    this.save();
    return file;
  }

  getUserFiles(userId: string) {
    return this.data.files.filter((f) => f.userId === userId);
  }

  getConversationFiles(conversationId: string): FileAttachment[] {
    return this.data.files.filter((f) => f.conversationId === conversationId);
  }

  getFileById(id: string): (FileAttachment & { userId: string; conversationId?: string }) | undefined {
    return this.data.files.find((f) => f.id === id);
  }

  deleteFileRecord(id: string, userId: string): boolean {
    const idx = this.data.files.findIndex((f) => f.id === id && f.userId === userId);
    if (idx === -1) return false;
    const file = this.data.files[idx];
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      console.error('Error unlinking file:', e);
    }
    this.data.files.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Generated Files ---
  createGeneratedFileRecord(record: DBGeneratedFile): DBGeneratedFile {
    this.data.generated_files = this.data.generated_files || [];
    this.data.generated_files.push(record);
    this.save();
    return record;
  }

  getGeneratedFileById(id: string): DBGeneratedFile | undefined {
    this.data.generated_files = this.data.generated_files || [];
    return this.data.generated_files.find((f) => f.id === id);
  }

  getConversationGeneratedFiles(conversationId: string): DBGeneratedFile[] {
    this.data.generated_files = this.data.generated_files || [];
    return this.data.generated_files.filter((f) => f.conversationId === conversationId);
  }

  // --- Generated Images ---
  createGeneratedImageRecord(record: DBGeneratedImage): DBGeneratedImage {
    this.data.generated_images = this.data.generated_images || [];
    this.data.generated_images.push(record);
    this.save();
    return record;
  }

  getGeneratedImageById(id: string): DBGeneratedImage | undefined {
    this.data.generated_images = this.data.generated_images || [];
    return this.data.generated_images.find((img) => img.id === id);
  }

  getConversationGeneratedImages(conversationId: string): DBGeneratedImage[] {
    this.data.generated_images = this.data.generated_images || [];
    return this.data.generated_images.filter((img) => img.conversationId === conversationId);
  }

  // --- Search ---
  searchConversations(userId: string, query: string): Array<{
    conversation: Conversation;
    matchedMessages: Message[];
  }> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const userConversations = this.data.conversations.filter((c) => c.userId === userId);
    const results: Array<{ conversation: Conversation; matchedMessages: Message[] }> = [];

    for (const conv of userConversations) {
      const titleMatches = conv.title.toLowerCase().includes(q);
      const convMessages = this.data.messages.filter((m) => m.conversationId === conv.id);
      const matchedMsgs = convMessages.filter((m) => m.content.toLowerCase().includes(q));

      if (titleMatches || matchedMsgs.length > 0) {
        results.push({
          conversation: conv,
          matchedMessages: matchedMsgs,
        });
      }
    }

    return results;
  }
}

export const db = new PersistentDatabase();
