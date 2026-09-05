import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  AuthRequest,
  authMiddleware,
  generateToken,
  hashPassword,
  optionalAuthMiddleware,
  verifyPassword,
} from './src/server/auth.js';
import { db } from './src/server/db.js';
import {
  AVAILABLE_MISTRAL_MODELS,
  DEFAULT_MISTRAL_MODEL,
  streamMistralChat,
} from './src/server/mistral.js';
import {
  generateDocument,
  parseFileContent,
  findGeneratedFileById,
} from './src/server/fileEngine.js';
import {
  generateRealImage,
  optimizeImagePrompt,
} from './src/server/imageEngine.js';
import {
  Conversation,
  FileAttachment,
  GeneratedFile,
  GeneratedImage,
  ImageAspectRatio,
  Message,
  User,
} from './src/types.js';

dotenv.config();

const app = express();
const PORT = 3000;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const IMAGES_DIR = path.join(UPLOADS_DIR, 'images');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitized}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

app.use(cors({
  exposedHeaders: ['X-Athlas-Token'],
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/images', express.static(IMAGES_DIR));

// --- API Routes ---

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    platform: '3 athlas',
    mistralConfigured: Boolean(process.env.MISTRAL_API_KEY),
    model: DEFAULT_MISTRAL_MODEL,
  });
});

// Available models
app.get('/api/models', (_req: Request, res: Response) => {
  res.json({ models: AVAILABLE_MISTRAL_MODELS });
});

// Auth: Register
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password sono obbligatori' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La password deve contenere almeno 6 caratteri' });
    }

    const existing = db.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Un account con questa email esiste già' });
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const user: User = {
      id: userId,
      email: email.toLowerCase().trim(),
      name: name?.trim() || email.split('@')[0],
      createdAt: new Date().toISOString(),
    };

    db.createUser({
      ...user,
      passwordHash: hashPassword(password),
    });

    const token = generateToken(userId);
    const settings = db.getUserSettings(userId);

    res.status(201).json({ user, token, settings });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore registrazione';
    res.status(500).json({ error: msg });
  }
});

// Auth: Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password sono obbligatori' });
    }

    const user = db.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const token = generateToken(user.id);
    const settings = db.getUserSettings(user.id);
    const safeUser: User = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };

    res.json({ user: safeUser, token, settings });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore login';
    res.status(500).json({ error: msg });
  }
});

// Auth: Instant Guest Session
app.post('/api/auth/guest', (_req: Request, res: Response) => {
  try {
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const guestUser: User = {
      id: guestId,
      email: `${guestId}@athlas.local`,
      name: 'Ospite Athlas',
      createdAt: new Date().toISOString(),
    };

    db.createUser({
      ...guestUser,
      passwordHash: hashPassword(guestId),
    });

    const token = generateToken(guestId);
    const settings = db.getUserSettings(guestId);

    res.json({ user: guestUser, token, settings });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore creazione guest session';
    res.status(500).json({ error: msg });
  }
});

// Auth: Get current user
app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res: Response) => {
  const user = db.findUserById(req.userId!);
  if (!user) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }
  const settings = db.getUserSettings(req.userId!);
  const safeUser: User = {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
  res.json({ user: safeUser, settings });
});

// Settings: Get & Update
app.get('/api/settings', authMiddleware, (req: AuthRequest, res: Response) => {
  const settings = db.getUserSettings(req.userId!);
  res.json(settings);
});

app.patch('/api/settings', authMiddleware, (req: AuthRequest, res: Response) => {
  const updated = db.updateUserSettings(req.userId!, req.body);
  res.json(updated);
});

// Conversations: List
app.get('/api/conversations', authMiddleware, (req: AuthRequest, res: Response) => {
  const list = db.getConversations(req.userId!);
  res.json(list);
});

// Conversations: Create
app.post('/api/conversations', authMiddleware, (req: AuthRequest, res: Response) => {
  const { title, model } = req.body;
  const userSettings = db.getUserSettings(req.userId!);
  const convId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const conv: Conversation = {
    id: convId,
    userId: req.userId!,
    title: title?.trim() || 'Nuova conversazione',
    model: model || userSettings.model || DEFAULT_MISTRAL_MODEL,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const created = db.createConversation(conv);
  res.status(201).json(created);
});

// Conversations: Update (rename)
app.patch('/api/conversations/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { title, model } = req.body;
  const updated = db.updateConversation(id, req.userId!, {
    ...(title ? { title: title.trim() } : {}),
    ...(model ? { model } : {}),
  });

  if (!updated) {
    return res.status(404).json({ error: 'Conversazione non trovata' });
  }
  res.json(updated);
});

// Conversations: Delete
app.delete('/api/conversations/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const success = db.deleteConversation(id, req.userId!);
  if (!success) {
    return res.status(404).json({ error: 'Conversazione non trovata' });
  }
  res.json({ success: true, id });
});

// Messages: List for conversation
app.get('/api/conversations/:id/messages', authMiddleware, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const conv = db.getConversationById(id, req.userId!);
  if (!conv) {
    return res.status(404).json({ error: 'Conversazione non trovata' });
  }
  const messages = db.getMessages(id);
  res.json(messages);
});

// Messages: Update (edit content or rating)
app.patch('/api/messages/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content, rating } = req.body;
  const msg = db.getMessageById(id);
  if (!msg) {
    return res.status(404).json({ error: 'Messaggio non trovato' });
  }

  // Ensure message belongs to user conversation
  const conv = db.getConversationById(msg.conversationId, req.userId!);
  if (!conv) {
    return res.status(403).json({ error: 'Accesso negato al messaggio' });
  }

  const updated = db.updateMessage(id, {
    ...(content !== undefined ? { content } : {}),
    ...(rating !== undefined ? { rating } : {}),
  });

  res.json(updated);
});

// Upload: Real File Upload & Deep Content Extraction
app.post('/api/upload', optionalAuthMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nessun file fornito' });
    }

    const { conversationId } = req.body;
    
    // Real parsing across PDF, DOCX, XLSX, CSV, TXT, code, images
    const parsed = await parseFileContent(file.path, file.originalname, file.mimetype);

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const attachment: FileAttachment = {
      id: fileId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
      fileCategory: parsed.category,
      pageCount: parsed.pageCount,
      rowCount: parsed.rowCount,
      wordCount: parsed.wordCount,
      sheets: parsed.sheets,
      analysisSummary: parsed.analysisSummary,
      analysisState: 'completed',
      extractedText: parsed.extractedText || undefined,
      createdAt: new Date().toISOString(),
    };

    if (req.userId) {
      db.createFileRecord({
        ...attachment,
        userId: req.userId,
        conversationId,
      });
    }

    res.json(attachment);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore upload e analisi file';
    res.status(500).json({ error: msg });
  }
});

// Files: Real File Generation Endpoint (DOCX, XLSX, PPTX, PDF, CSV, TXT, JSON, MD)
app.post('/api/files/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { format, title, description, content, filename, conversationId, messageId, structuredData } = req.body;
    if (!format) {
      return res.status(400).json({ error: 'Formato di generazione obbligatorio' });
    }

    const { fileRecord, filePath } = await generateDocument({
      format,
      title: title || 'Documento 3 athlas',
      description,
      content: content || '',
      filename,
      structuredData,
    });

    db.createGeneratedFileRecord({
      ...fileRecord,
      userId: req.userId!,
      conversationId,
      messageId,
      filePath,
    });

    // If messageId provided, update the message to include this generated file
    if (messageId) {
      const msg = db.getMessageById(messageId);
      if (msg) {
        const existing = msg.generatedFiles || [];
        db.updateMessage(messageId, { generatedFiles: [...existing, fileRecord] });
      }
    }

    res.status(201).json(fileRecord);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore generazione file';
    res.status(500).json({ error: msg });
  }
});

// Files: Real File Download Endpoint
app.get('/api/files/download/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const dbRecord = db.getGeneratedFileById(id);
  const diskRecord = findGeneratedFileById(id);

  if (dbRecord && fs.existsSync(dbRecord.filePath)) {
    return res.download(dbRecord.filePath, dbRecord.originalName);
  }

  if (diskRecord && fs.existsSync(diskRecord.path)) {
    return res.download(diskRecord.path, diskRecord.file.originalName);
  }

  // Also fallback to check uploaded files
  const uploaded = db.getFileById(id);
  if (uploaded && fs.existsSync(uploaded.path)) {
    return res.download(uploaded.path, uploaded.originalName);
  }

  res.status(404).json({ error: 'File richiesto non trovato o scaduto' });
});

// Images: Real Image Download Endpoint
app.get('/api/images/download/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const dbRecord = db.getGeneratedImageById(id);

  if (dbRecord && fs.existsSync(dbRecord.filePath)) {
    const safeTitle = (dbRecord.prompt || 'immagine_athlas')
      .slice(0, 30)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');
    const ext = dbRecord.imageUrl.endsWith('.png') ? 'png' : 'jpg';
    return res.download(dbRecord.filePath, `${safeTitle}_${dbRecord.id}.${ext}`);
  }

  // Fallback check on disk directly
  if (fs.existsSync(IMAGES_DIR)) {
    const files = fs.readdirSync(IMAGES_DIR);
    const match = files.find((f) => f.startsWith(id));
    if (match) {
      return res.download(path.join(IMAGES_DIR, match), match);
    }
  }

  res.status(404).json({ error: 'Immagine non trovata' });
});

// Images: Generate real image endpoint
app.post('/api/images/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { prompt, aspectRatio, conversationId, messageId, referenceImageId, referenceImageBase64 } =
      req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt di generazione obbligatorio' });
    }

    const userSettings = db.getUserSettings(req.userId!);
    const result = await generateRealImage({
      prompt,
      aspectRatio: aspectRatio as ImageAspectRatio,
      conversationId: conversationId || `conv_${Date.now()}`,
      messageId,
      referenceImageId,
      referenceImageBase64,
      geminiApiKey: userSettings.geminiApiKeyOverride,
      userId: req.userId,
    });

    db.createGeneratedImageRecord({
      ...result.image,
      userId: req.userId!,
      filePath: result.filePath,
    });

    if (messageId) {
      const msg = db.getMessageById(messageId);
      if (msg) {
        const existing = msg.generatedImages || [];
        db.updateMessage(messageId, { generatedImages: [...existing, result.image] });
      }
    }

    res.status(201).json(result.image);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore durante la generazione dell\'immagine';
    res.status(500).json({ error: msg });
  }
});

// Images: Edit existing image endpoint (Image-to-Image)
app.post('/api/images/edit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { imageId, editPrompt, aspectRatio, conversationId, messageId } = req.body;
    if (!imageId || !editPrompt) {
      return res.status(400).json({ error: 'ID immagine e istruzione di modifica obbligatori' });
    }

    const original = db.getGeneratedImageById(imageId);
    let referenceBase64: string | undefined;
    let mimeType = 'image/jpeg';

    if (original && fs.existsSync(original.filePath)) {
      const fileBuffer = fs.readFileSync(original.filePath);
      referenceBase64 = fileBuffer.toString('base64');
      mimeType = original.filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    }

    const userSettings = db.getUserSettings(req.userId!);
    const result = await generateRealImage({
      prompt: editPrompt,
      aspectRatio: (aspectRatio || original?.aspectRatio || '1:1') as ImageAspectRatio,
      referenceImageBase64: referenceBase64,
      referenceImageMimeType: mimeType,
      referenceImageId: imageId,
      referenceImageUrl: original?.imageUrl,
      conversationId: conversationId || original?.conversationId || `conv_${Date.now()}`,
      messageId,
      geminiApiKey: userSettings.geminiApiKeyOverride,
      userId: req.userId,
    });

    db.createGeneratedImageRecord({
      ...result.image,
      userId: req.userId!,
      filePath: result.filePath,
    });

    if (messageId) {
      const msg = db.getMessageById(messageId);
      if (msg) {
        const existing = msg.generatedImages || [];
        db.updateMessage(messageId, { generatedImages: [...existing, result.image] });
      }
    }

    res.status(201).json(result.image);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore durante la modifica dell\'immagine';
    res.status(500).json({ error: msg });
  }
});

// Images: Get all generated images for a conversation
app.get('/api/conversations/:id/images', authMiddleware, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const images = db.getConversationGeneratedImages(id);
  res.json(images);
});

// Files: Get all files for a conversation (uploaded and generated)
app.get('/api/conversations/:id/files', authMiddleware, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const uploaded = db.getConversationFiles(id);
  const generated = db.getConversationGeneratedFiles(id);
  res.json({ uploaded, generated });
});

// Files: List user files
app.get('/api/files', authMiddleware, (req: AuthRequest, res: Response) => {
  const files = db.getUserFiles(req.userId!);
  res.json(files);
});

// Files: Delete file
app.delete('/api/files/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const success = db.deleteFileRecord(req.params.id, req.userId!);
  res.json({ success });
});

// Search: Full-text search across user conversations and messages
app.get('/api/search', authMiddleware, (req: AuthRequest, res: Response) => {
  const query = (req.query.q as string) || '';
  const results = db.searchConversations(req.userId!, query);
  res.json(results);
});

// Chat: Main Streaming Endpoint with Mistral AI
app.post('/api/chat', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { conversationId, content, attachments, regenerateMessageId, editMessageId, modelOverride } =
    req.body;

  if (!conversationId) {
    return res.status(400).json({ error: 'ID conversazione obbligatorio' });
  }

  const conv = db.getConversationById(conversationId, req.userId!);
  if (!conv) {
    return res.status(404).json({ error: 'Conversazione non trovata' });
  }

  const userSettings = db.getUserSettings(req.userId!);
  const modelToUse = modelOverride || conv.model || userSettings.model || DEFAULT_MISTRAL_MODEL;

  // If edit message, trim history and update content
  if (editMessageId) {
    db.deleteMessagesAfter(conversationId, editMessageId);
    if (content) {
      db.updateMessage(editMessageId, { content });
    }
  } else if (regenerateMessageId) {
    // If regenerate, remove the assistant message and everything after it
    db.deleteMessagesAfter(conversationId, regenerateMessageId);
    const existingMsg = db.getMessageById(regenerateMessageId);
    if (existingMsg && existingMsg.role === 'assistant') {
      // Remove this assistant message so a new one is generated
      const all = db.getMessages(conversationId);
      const prevUser = all.filter((m) => m.id !== regenerateMessageId);
      // We will generate a fresh assistant reply for the last user message
    }
  } else if (content) {
    // Standard new user message
    const userMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const userMsg: Message = {
      id: userMsgId,
      conversationId,
      role: 'user',
      content,
      attachments: attachments || [],
      createdAt: new Date().toISOString(),
    };
    db.createMessage(userMsg);

    // Auto-update conversation title if it's the first message
    const msgs = db.getMessages(conversationId);
    if (msgs.length <= 1) {
      const generatedTitle =
        content.length > 36 ? `${content.slice(0, 36).trim()}...` : content.trim();
      db.updateConversation(conversationId, req.userId!, { title: generatedTitle });
    }
  }

  // Get all conversation files so context is preserved across the entire conversation
  const conversationFiles = db.getConversationFiles(conversationId);
  if (attachments && Array.isArray(attachments)) {
    for (const att of attachments) {
      if (!conversationFiles.some((cf) => cf.id === att.id)) {
        conversationFiles.push(att);
      }
    }
  }

  // Get updated message list for context
  const contextMessages = db.getMessages(conversationId);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Create placeholder assistant message
  const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  res.write(`data: ${JSON.stringify({ messageId: assistantMsgId })}\n\n`);

  let accumulatedContent = '';

  await streamMistralChat({
    messages: contextMessages,
    conversationFiles,
    model: modelToUse,
    temperature: userSettings.temperature || 0.7,
    systemPrompt: userSettings.systemPrompt,
    apiKeyOverride: userSettings.mistralApiKeyOverride,
    res,
    onDelta: (delta) => {
      accumulatedContent += delta;
    },
    onComplete: async (fullText, actualModelUsed) => {
      if (fullText.trim()) {
        let cleanText = fullText;
        const generatedList: GeneratedFile[] = [];

        // 1. Check for explicit AI generation tag
        const genMatch = fullText.match(/```athlas-file-generate\s*([\s\S]*?)\s*```/);
        if (genMatch) {
          try {
            const parsedGen = JSON.parse(genMatch[1]);
            const genResult = await generateDocument({
              format: parsedGen.format || 'docx',
              filename: parsedGen.filename,
              title: parsedGen.title || 'Documento 3 athlas',
              description: parsedGen.description,
              content: parsedGen.content || fullText.replace(genMatch[0], '').trim(),
              structuredData: parsedGen.structuredData,
            });

            db.createGeneratedFileRecord({
              ...genResult.fileRecord,
              userId: req.userId!,
              conversationId,
              messageId: assistantMsgId,
              filePath: genResult.filePath,
            });

            generatedList.push(genResult.fileRecord);
            cleanText = fullText.replace(genMatch[0], '').trim();

            res.write(`data: ${JSON.stringify({ generatedFile: genResult.fileRecord })}\n\n`);
          } catch (e) {
            console.error('Error generating document from AI tag:', e);
          }
        }

        // 2. Intelligent Auto-Generation if the user explicitly requested a file format
        if (generatedList.length === 0 && content) {
          const userPrompt = content.toLowerCase();
          const wantsDocx =
            userPrompt.includes('word') ||
            userPrompt.includes('docx') ||
            userPrompt.includes('documento word');
          const wantsXlsx =
            userPrompt.includes('excel') ||
            userPrompt.includes('xlsx') ||
            userPrompt.includes('foglio di calcolo');
          const wantsPptx =
            userPrompt.includes('presentazione') ||
            userPrompt.includes('powerpoint') ||
            userPrompt.includes('pptx') ||
            userPrompt.includes('slide');
          const wantsPdf =
            userPrompt.includes('pdf') ||
            userPrompt.includes('esporta in pdf') ||
            userPrompt.includes('genera pdf');

          if (wantsDocx || wantsXlsx || wantsPptx || wantsPdf) {
            try {
              const format = wantsDocx ? 'docx' : wantsXlsx ? 'xlsx' : wantsPptx ? 'pptx' : 'pdf';
              const fileTitle =
                format === 'xlsx'
                  ? 'Estrazione Dati Excel'
                  : format === 'pptx'
                  ? 'Presentazione 3 athlas'
                  : format === 'docx'
                  ? 'Documento Ufficiale'
                  : 'Report Documento';

              const genResult = await generateDocument({
                format,
                title: fileTitle,
                description: `File ${format.toUpperCase()} generato su richiesta da 3 athlas.`,
                content: cleanText,
              });

              db.createGeneratedFileRecord({
                ...genResult.fileRecord,
                userId: req.userId!,
                conversationId,
                messageId: assistantMsgId,
                filePath: genResult.filePath,
              });

              generatedList.push(genResult.fileRecord);
              res.write(`data: ${JSON.stringify({ generatedFile: genResult.fileRecord })}\n\n`);
            } catch (err) {
              console.error('Error auto-generating file on user request:', err);
            }
          }
        }

        // 3. Real Image Generation & Editing (3 Athlas ImageCore™)
        const generatedImagesList: GeneratedImage[] = [];
        const imageGenMatch = fullText.match(/```athlas-image-generate\s*([\s\S]*?)\s*```/);
        const userPromptLower = (content || '').toLowerCase();

        const isImageRequest =
          Boolean(imageGenMatch) ||
          /(genera|crea|disegna|fai|voglio|produci)\s+(un'|un\s+|una\s+)?(immagine|foto|logo|disegno|grafica|illustrazione|rendering|wallpaper|copertina)/i.test(
            userPromptLower
          ) ||
          /(immagine|logo|foto|disegno)\s+(di|per|con|su|realistica|futuristica)/i.test(
            userPromptLower
          );

        const isImageEditRequest =
          !imageGenMatch &&
          (attachments?.some((a) => a.fileCategory === 'image') ||
            db.getConversationGeneratedImages(conversationId).length > 0) &&
          /(modifica|rimuovi lo sfondo|cambia il colore|cambia colore|rendi.*realistico|aggiungi.*sfondo|trasforma.*stile)/i.test(
            userPromptLower
          );

        if (imageGenMatch || isImageRequest || isImageEditRequest) {
          try {
            let promptToGenerate = '';
            let requestedAspectRatio: ImageAspectRatio = '1:1';
            let style = 'photorealistic';

            if (imageGenMatch) {
              try {
                const parsedImg = JSON.parse(imageGenMatch[1]);
                promptToGenerate = parsedImg.prompt || '';
                if (['1:1', '16:9', '9:16', '4:3', '3:4'].includes(parsedImg.aspectRatio)) {
                  requestedAspectRatio = parsedImg.aspectRatio;
                }
                if (parsedImg.style) style = parsedImg.style;
              } catch (e) {
                console.error('Error parsing athlas-image-generate tag:', e);
              }
            }

            if (!promptToGenerate) {
              promptToGenerate = content || 'Immagine artistica ad alta risoluzione';
            }

            // Check for reference image (Image-to-Image editing)
            let referenceBase64: string | undefined;
            let referenceMimeType = 'image/jpeg';
            let referenceImageId: string | undefined;
            let referenceImageUrl: string | undefined;

            const imageAttachment = attachments?.find((a) => a.fileCategory === 'image');
            if (imageAttachment && fs.existsSync(imageAttachment.path)) {
              referenceBase64 = fs.readFileSync(imageAttachment.path).toString('base64');
              referenceMimeType = imageAttachment.mimeType;
              referenceImageId = imageAttachment.id;
            } else if (isImageEditRequest) {
              const prevImages = db.getConversationGeneratedImages(conversationId);
              if (prevImages.length > 0) {
                const lastImg = prevImages[prevImages.length - 1];
                if (fs.existsSync(lastImg.filePath)) {
                  referenceBase64 = fs.readFileSync(lastImg.filePath).toString('base64');
                  referenceMimeType = lastImg.filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
                  referenceImageId = lastImg.id;
                  referenceImageUrl = lastImg.imageUrl;
                }
              }
            }

            const imgResult = await generateRealImage({
              prompt: promptToGenerate,
              aspectRatio: requestedAspectRatio,
              style,
              referenceImageBase64,
              referenceImageMimeType,
              referenceImageId,
              referenceImageUrl,
              conversationId,
              messageId: assistantMsgId,
              userId: req.userId,
              geminiApiKey: userSettings.geminiApiKeyOverride,
              onStep: (step, text) => {
                res.write(`data: ${JSON.stringify({ imageStep: { step, text } })}\n\n`);
              },
            });

            db.createGeneratedImageRecord({
              ...imgResult.image,
              userId: req.userId!,
              filePath: imgResult.filePath,
            });

            generatedImagesList.push(imgResult.image);
            if (imageGenMatch) {
              cleanText = cleanText.replace(imageGenMatch[0], '').trim();
            }

            res.write(`data: ${JSON.stringify({ generatedImage: imgResult.image })}\n\n`);
          } catch (imgErr: any) {
            console.error('Error generating image in chat flow:', imgErr);
            res.write(
              `data: ${JSON.stringify({
                imageError: imgErr?.message || 'Errore nella generazione dell\'immagine',
              })}\n\n`
            );
          }
        }

        const assistantMsg: Message = {
          id: assistantMsgId,
          conversationId,
          role: 'assistant',
          content: cleanText,
          generatedFiles: generatedList.length > 0 ? generatedList : undefined,
          generatedImages: generatedImagesList.length > 0 ? generatedImagesList : undefined,
          createdAt: new Date().toISOString(),
        };
        db.createMessage(assistantMsg);

        // If the model had to fallback, update the conversation and user settings
        // so subsequent requests directly use the compatible model
        if (actualModelUsed && actualModelUsed !== conv.model) {
          db.updateConversation(conversationId, req.userId!, { model: actualModelUsed });
          db.updateUserSettings(req.userId!, { model: actualModelUsed });
        }
      }
    },
    onError: (err) => {
      console.error('Chat error for conversation:', conversationId, err.message);
    },
  });
});

// Setup Vite middleware in dev or static serving in production
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ 3 athlas Server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
});
