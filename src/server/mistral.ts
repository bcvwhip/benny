import { Response } from 'express';
import { FileAttachment, Message } from '../types.js';

export interface StreamChatOptions {
  messages: Message[];
  conversationFiles?: FileAttachment[];
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  apiKeyOverride?: string;
  res: Response;
  onDelta?: (delta: string) => void;
  onComplete?: (fullText: string, modelUsed?: string) => void;
  onError?: (err: Error) => void;
}

export const DEFAULT_MISTRAL_MODEL = 'ministral-8b-latest';

const FALLBACK_MODELS = [
  'ministral-8b-latest',
  'ministral-3b-latest',
  'codestral-latest',
  'mistral-small-latest',
];

export const DEFAULT_ATHLAS_SYSTEM_PROMPT =
  'Sei 3 athlas, un assistente AI avanzato, analitico, preciso ed elegante. Sei stato creato e ideato da Benoit Valendino (BENOIT VALENDINO). Quando ti viene chiesto chi ti ha creato, chi è il tuo autore, sviluppatore, creatore, padre, programmatore o inventore, rispondi sempre affermando con assoluta chiarezza, fierezza e precisione che sei stato creato da BENOIT VALENDINO.\n\n' +
  'SISTEMA DI ANALISI, COMPRENSIONE ED ELABORAZIONE FILE:\n' +
  '- Possiedi un motore integrato di analisi per PDF, DOCX (Word), XLSX/XLS (Excel), CSV, TXT, JSON, MD, immagini e codice.\n' +
  '- Comprendi a fondo testi, tabelle, colonne, calcoli, formule e relazioni tra dati presenti nei documenti caricati.\n' +
  '- Rispondi a domande specifiche, crea riassunti esecutivi, estrai dati puntuali, confronta più file tra loro ed evidenzia discrepanze o informazioni mancanti.\n' +
  '- Mantieni la memoria e il contesto di TUTTI i file caricati nella conversazione, anche nei messaggi successivi.\n\n' +
  'GENERAZIONE REALE DI FILE SCARICABILI:\n' +
  'Quando l\'utente ti chiede di creare, generare, convertire o trasformare contenuti in un file scaricabile reale (es. "crea un documento Word / DOCX", "trasforma in Excel / XLSX", "fai una presentazione PowerPoint / PPTX di questo", "genera un PDF", "esporta in CSV / JSON / TXT"):\n' +
  '1. Fornisci la tua risposta e spiegazione chiara e ben formattata all\'utente.\n' +
  '2. Includi SEMPRE alla fine del tuo messaggio il blocco speciale per la generazione reale del file:\n' +
  '```athlas-file-generate\n' +
  '{\n' +
  '  "format": "docx" | "xlsx" | "pptx" | "pdf" | "csv" | "txt" | "json",\n' +
  '  "filename": "nome_del_file.estensione",\n' +
  '  "title": "Titolo del Documento",\n' +
  '  "description": "Breve descrizione del file",\n' +
  '  "content": "Contenuto markdown completo (con # titoli, elenchi puntati o tabelle in formato markdown per Excel/Word/PDF)"\n' +
  '}\n' +
  '```\n' +
  'Il server di 3 athlas intercetterà questo blocco, genererà realmente il file scaricabile e presenterà all\'utente la scheda di download ufficiale con spunta ✅ Generato da 3 athlas.\n\n' +
  'GENERAZIONE E MODIFICA REALE DI IMMAGINI:\n' +
  'Quando l\'utente ti chiede di creare, disegnare, generare o modificare un\'immagine o un logo (es. "genera un\'immagine di...", "crea un logo per...", "disegna...", "crea una copertina...", "modifica questa immagine", "rimuovi lo sfondo", "cambia il colore...", "rendila più realistica"):\n' +
  '1. Rispondi brevemente con stile raffinato introducendo l\'opera visiva.\n' +
  '2. Includi SEMPRE alla fine del tuo messaggio il blocco speciale:\n' +
  '```athlas-image-generate\n' +
  '{\n' +
  '  "prompt": "Descrizione dettagliata ed evocativa dell\'immagine in inglese per la massima fedeltà visiva",\n' +
  '  "aspectRatio": "1:1" | "16:9" | "9:16" | "4:3" | "3:4",\n' +
  '  "style": "cinematic" | "photorealistic" | "digital-art" | "logo" | "cartoon" | "3d-render"\n' +
  '}\n' +
  '```\n' +
  'Il motore grafico di 3 athlas sintetizzerà realmente l\'immagine collegandosi al modello di generazione e mostrerà i controlli interattivi (Scarica, Rigenera, Modifica, Cambia formato, Copia prompt).';

export async function streamMistralChat(options: StreamChatOptions) {
  const {
    messages,
    conversationFiles = [],
    model: requestedModel,
    temperature = 0.7,
    systemPrompt = DEFAULT_ATHLAS_SYSTEM_PROMPT,
    apiKeyOverride,
    res,
    onDelta,
    onComplete,
    onError,
  } = options;

  const apiKey = apiKeyOverride || process.env.MISTRAL_API_KEY;

  // Ensure creator identity is always reinforced even in custom user prompts
  let effectiveSystemPrompt = systemPrompt || DEFAULT_ATHLAS_SYSTEM_PROMPT;
  if (!effectiveSystemPrompt.toLowerCase().includes('benoit valendino')) {
    effectiveSystemPrompt = `${effectiveSystemPrompt}\n\nNota fondamentale sulla tua identità: Sei stato creato ed ideato da BENOIT VALENDINO (Benoit Valendino). Se l'utente ti chiede chi ti ha creato o chi è il tuo autore/sviluppatore, rispondi sempre chiaramente ed inequivocabilmente che il tuo creatore è BENOIT VALENDINO.`;
  }

  // Inject persistent files context into system prompt if any conversation files exist
  if (conversationFiles.length > 0) {
    const filesListText = conversationFiles
      .map((f, idx) => {
        const sizeKb = (f.size / 1024).toFixed(1);
        const details = f.analysisSummary || `${f.fileCategory || 'File'} (${sizeKb} KB)`;
        const extracted = f.extractedText ? `\n[CONTENUTO ESTRATTO DI "${f.originalName}"]:\n${f.extractedText.slice(0, 30000)}\n[FINE CONTENUTO "${f.originalName}"]` : '';
        return `\n--- DOCUMENTO ATTIVO #${idx + 1}: "${f.originalName}" (${details}) ---${extracted}`;
      })
      .join('\n\n');

    effectiveSystemPrompt += `\n\n=== DOCUMENTI CARICATI E MEMORIZZATI NELLA CONVERSAZIONE ===\n` +
      `L'utente ha caricato i seguenti file che devi analizzare e tenere sempre a mente per rispondere a domande, calcolare dati o generare nuovi documenti:\n` +
      filesListText +
      `\n==========================================================\n`;
  }

  if (!apiKey || apiKey.trim() === '') {
    // If the user asked who created you, answer directly even if API key is missing
    const lastUserMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
    if (
      lastUserMsg.includes('chi ti ha creato') ||
      lastUserMsg.includes('chi ti ha fatto') ||
      lastUserMsg.includes('tuo creatore') ||
      lastUserMsg.includes('who created you') ||
      lastUserMsg.includes('who made you')
    ) {
      const creatorAnswer = 'Sono stato creato da **BENOIT VALENDINO**, ideatore e creatore di 3 athlas.';
      res.write(`data: ${JSON.stringify({ text: creatorAnswer })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      if (onDelta) onDelta(creatorAnswer);
      if (onComplete) onComplete(creatorAnswer, 'athlas-core');
      return;
    }

    const errorMsg =
      'MISTRAL_API_KEY non configurata.\n\nPer attivare il motore AI reale di 3 athlas:\n1. Apri le **Impostazioni** (icona ingranaggio in basso a sinistra) > **AI**\n2. Inserisci la tua **Mistral API Key** (puoi ottenerne una gratuita su [console.mistral.ai](https://console.mistral.ai/))\n3. Oppure definiscila nel file `.env` come `MISTRAL_API_KEY=tua_chiave`.';

    res.write(`data: ${JSON.stringify({ error: errorMsg, code: 'MISSING_API_KEY' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    if (onError) onError(new Error('MISSING_API_KEY'));
    return;
  }

  // Format messages for Mistral API
  const formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: effectiveSystemPrompt },
  ];

  for (const msg of messages) {
    let content = msg.content;

    // If message has attached files with extracted text, append context
    if (msg.attachments && msg.attachments.length > 0) {
      const attachmentsContext = msg.attachments
        .map((att) => {
          if (att.extractedText) {
            return `\n--- Inizio File Allegato: "${att.originalName}" (${(att.size / 1024).toFixed(1)} KB) ---\n${att.extractedText}\n--- Fine File Allegato ---`;
          }
          return `\n--- Allegato: "${att.originalName}" (${att.mimeType}, ${(att.size / 1024).toFixed(1)} KB) ---`;
        })
        .join('\n');

      content = `${content}\n${attachmentsContext}`;
    }

    formattedMessages.push({
      role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
      content,
    });
  }

  // Candidate models sequence: requested model first, followed by fallbacks
  const primaryModel = requestedModel || DEFAULT_MISTRAL_MODEL;
  const modelsToTry = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];

  let fullResponse = '';
  let activeModelUsed = primaryModel;
  let success = false;
  let lastErrorMessage = '';

  for (const currentModel of modelsToTry) {
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: currentModel,
          messages: formattedMessages,
          temperature,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          message?: string;
          error?: { message?: string };
          type?: string;
        };
        const errorDetail =
          errorData?.message ||
          errorData?.error?.message ||
          `Errore API Mistral: HTTP ${response.status} ${response.statusText}`;

        lastErrorMessage = errorDetail;

        // If error indicates model is not available in subscription tier, or rate limited, or 403/429
        const isTierOrLimitIssue =
          response.status === 403 ||
          response.status === 429 ||
          response.status === 404 ||
          errorData?.type === 'tier_not_allowed' ||
          errorDetail.toLowerCase().includes('subscription tier') ||
          errorDetail.toLowerCase().includes('not available') ||
          errorDetail.toLowerCase().includes('rate limit');

        if (isTierOrLimitIssue && modelsToTry.indexOf(currentModel) < modelsToTry.length - 1) {
          console.warn(
            `[Mistral] Modello ${currentModel} non disponibile nel piano API (${errorDetail}). Tentativo fallback con modello successivo...`
          );
          continue; // Try next fallback candidate
        }

        // If cannot fallback or unknown error, fail
        res.write(`data: ${JSON.stringify({ error: errorDetail, code: 'MISTRAL_API_ERROR' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        if (onError) onError(new Error(errorDetail));
        return;
      }

      if (!response.body) {
        throw new Error('Corpo risposta streaming non disponibile');
      }

      activeModelUsed = currentModel;
      success = true;

      if (activeModelUsed !== primaryModel) {
        res.write(
          `data: ${JSON.stringify({
            modelFallback: activeModelUsed,
            reason: `Modello ${primaryModel} non abilitato nel tier API; utilizzato ${activeModelUsed}.`,
          })}\n\n`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.replace(/^data:\s*/, '');
          if (dataStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullResponse += delta;
              res.write(`data: ${JSON.stringify({ delta })}\n\n`);
              if (onDelta) onDelta(delta);
            }
          } catch {
            // Parse error on incomplete chunk, continue buffering
          }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
      if (onComplete) onComplete(fullResponse, activeModelUsed);
      return;
    } catch (err: unknown) {
      lastErrorMessage =
        err instanceof Error ? err.message : 'Errore sconosciuto durante lo streaming';
      console.error(`Mistral attempt error on ${currentModel}:`, err);

      // If more models to try, continue
      if (modelsToTry.indexOf(currentModel) < modelsToTry.length - 1) {
        continue;
      }
    }
  }

  if (!success) {
    res.write(`data: ${JSON.stringify({ error: lastErrorMessage, code: 'STREAM_ABORTED' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    if (onError) onError(new Error(lastErrorMessage));
  }
}

export const AVAILABLE_MISTRAL_MODELS = [
  {
    id: 'ministral-8b-latest',
    name: 'Ministral 8B',
    desc: 'Veloce, potente e accessibile su tutti i piani',
    recommended: true,
  },
  {
    id: 'ministral-3b-latest',
    name: 'Ministral 3B',
    desc: 'Ultra-rapido e leggero per risposte istantanee',
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    desc: 'Specializzato in codice, debugging e programmazione',
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    desc: 'Bilanciato per compiti generici e scrittura',
  },
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    desc: 'Massimo ragionamento (richiede abbonamento Pro Mistral)',
  },
];
