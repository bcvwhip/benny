export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  theme: 'dark' | 'light' | 'system';
  model: string;
  systemPrompt: string;
  temperature: number;
  ttsVoice: string;
  ttsRate: number;
  sttLanguage: string;
  mistralApiKeyOverride?: string;
  geminiApiKeyOverride?: string;
}

export type FileCategory = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'image' | 'code' | 'other';

export interface FileAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  fileCategory?: FileCategory;
  pageCount?: number;
  rowCount?: number;
  wordCount?: number;
  sheets?: string[];
  analysisSummary?: string;
  analysisState?: 'analyzing' | 'reading' | 'processing' | 'completed' | 'error';
  extractedText?: string;
  createdAt: string;
}

export type GeneratedFileFormat = 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'csv' | 'txt' | 'json' | 'md';

export interface GeneratedFile {
  id: string;
  originalName: string;
  format: GeneratedFileFormat;
  size: number;
  downloadUrl: string;
  description?: string;
  generatedBy: '3 athlas';
  createdAt: string;
}

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export interface GeneratedImage {
  id: string;
  conversationId: string;
  messageId?: string;
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio: ImageAspectRatio;
  imageUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  model: string;
  referenceImageId?: string;
  referenceImageUrl?: string;
  createdAt: string;
  generatedBy: '3 athlas';
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: FileAttachment[];
  generatedFiles?: GeneratedFile[];
  generatedImages?: GeneratedImage[];
  rating?: 1 | -1 | 0;
  createdAt: string;
  updatedAt?: string;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  lastMessageSnippet?: string;
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
  messageId?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  settings: UserSettings;
}

export type VoicePersonalityId = 'aria' | 'nova' | 'orion' | 'luna';

export interface VoicePersonality {
  id: VoicePersonalityId;
  name: string;
  tagline: string;
  description: string;
  pitch: number;
  rate: number;
  color: string;
  gender: 'female' | 'male';
  recommendedVoiceKeywords: string[];
}

export type VoiceOrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceSettings {
  personality: VoicePersonalityId;
  continuousConversation: boolean;
  bargeInEnabled: boolean;
  autoSpeakResponse: boolean;
  micSensitivity: number; // 0.0 to 1.0
  soundEffects: boolean;
}
