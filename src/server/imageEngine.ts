import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { GeneratedImage, ImageAspectRatio } from '../types.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const IMAGES_DIR = path.join(UPLOADS_DIR, 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

export interface ImageOptimizationResult {
  enhancedPrompt: string;
  aspectRatio: ImageAspectRatio;
  style: string;
  summaryIt: string;
}

export interface GenerateImageOptions {
  prompt: string;
  aspectRatio?: ImageAspectRatio;
  style?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
  referenceImageId?: string;
  referenceImageUrl?: string;
  geminiApiKey?: string;
  conversationId: string;
  messageId?: string;
  userId?: string;
  onStep?: (step: 'optimizing' | 'generating' | 'finalizing', message: string) => void;
}

/**
 * Dimensions mapping for standard aspect ratios
 */
export const ASPECT_RATIO_DIMENSIONS: Record<
  ImageAspectRatio,
  { width: number; height: number; geminiRatio: string }
> = {
  '1:1': { width: 1024, height: 1024, geminiRatio: '1:1' },
  '16:9': { width: 1280, height: 720, geminiRatio: '16:9' },
  '9:16': { width: 720, height: 1280, geminiRatio: '9:16' },
  '4:3': { width: 1024, height: 768, geminiRatio: '4:3' },
  '3:4': { width: 768, height: 1024, geminiRatio: '3:4' },
};

/**
 * Optimize user prompt using Mistral to build a highly detailed, professional prompt
 * specifying subject, environment, lighting, composition, colors, mood, and realism.
 */
export async function optimizeImagePrompt(
  userQuery: string,
  targetAspectRatio?: ImageAspectRatio,
  referenceContext?: string
): Promise<ImageOptimizationResult> {
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) {
    return {
      enhancedPrompt: userQuery,
      aspectRatio: targetAspectRatio || '1:1',
      style: 'cinematic photorealistic',
      summaryIt: userQuery,
    };
  }

  try {
    const systemInstruction = `You are 3 athlas's Master AI Image Prompt Engineer.
Transform the user's natural language request into an exceptionally detailed, photorealistic, cinematic prompt for state-of-the-art AI image generation models (Gemini Flash Image / FLUX).

Ensure the prompt explicitly details:
1. Exact Subject (anatomy, materials, textures, expressions, fine details)
2. Environment / Background (depth of field, scenery, atmospheric particles, architecture)
3. Lighting (e.g. volumetric god-rays, rim light, golden hour, neon subsurface glow, ray-traced reflections)
4. Composition & Camera Perspective (e.g. 85mm portrait lens, wide-angle cinematic, low-angle, rule of thirds, f/1.4 aperture)
5. Color Palette & Mood (harmonious tones, color grading, emotional atmosphere)
6. Level of Realism (8k resolution, photorealistic, octane render, masterpiece)

${referenceContext ? `Important: The user wants to edit or evolve a previous image. Previous image context: "${referenceContext}". Apply the user's modifications precisely.` : ''}

Respond ONLY with a JSON object strictly matching this schema:
{
  "enhancedPrompt": "Comprehensive English generation prompt",
  "aspectRatio": "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
  "style": "Brief style description (e.g. Hyper-realistic cinematic photography)",
  "summaryIt": "Sintesi elegante in italiano per l'utente (1 frase)"
}`;

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ministral-8b-latest',
        messages: [
          { role: 'system', content: systemInstruction },
          {
            role: 'user',
            content: `Richiesta utente: "${userQuery}"${
              targetAspectRatio ? ` (Formato preferito: ${targetAspectRatio})` : ''
            }`,
          },
        ],
        temperature: 0.6,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return {
          enhancedPrompt: parsed.enhancedPrompt || userQuery,
          aspectRatio:
            targetAspectRatio ||
            (['1:1', '16:9', '9:16', '4:3', '3:4'].includes(parsed.aspectRatio)
              ? parsed.aspectRatio
              : '1:1'),
          style: parsed.style || 'Photorealistic',
          summaryIt: parsed.summaryIt || userQuery,
        };
      }
    }
  } catch (e) {
    console.error('Prompt optimization fallback:', e);
  }

  return {
    enhancedPrompt: userQuery,
    aspectRatio: targetAspectRatio || '1:1',
    style: 'Photorealistic',
    summaryIt: userQuery,
  };
}

/**
 * Generate a real image using either Gemini or high-quality diffusion pipeline
 */
export async function generateRealImage(
  options: GenerateImageOptions
): Promise<{ image: GeneratedImage; filePath: string }> {
  const {
    prompt,
    aspectRatio: requestedRatio = '1:1',
    referenceImageBase64,
    referenceImageMimeType = 'image/jpeg',
    referenceImageId,
    referenceImageUrl,
    geminiApiKey,
    conversationId,
    messageId,
    onStep,
  } = options;

  // Step 1: Optimize prompt
  if (onStep) onStep('optimizing', '✨ Creo la tua immagine...');
  const optimized = await optimizeImagePrompt(
    prompt,
    requestedRatio,
    referenceImageId ? `Editing existing image ${referenceImageId}` : undefined
  );

  const finalAspectRatio: ImageAspectRatio = requestedRatio || optimized.aspectRatio || '1:1';
  const dimensions = ASPECT_RATIO_DIMENSIONS[finalAspectRatio] || ASPECT_RATIO_DIMENSIONS['1:1'];

  const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  let imageBuffer: Buffer | null = null;
  let modelUsed = 'FLUX.1 High-Resolution';
  let mimeType = 'image/jpeg';
  let extension = 'jpg';

  // Step 2: Processing
  if (onStep) onStep('generating', '⚡ Sto elaborando...');

  // Attempt A: Try Gemini image models if API key is provided or process.env is configured
  const effectiveGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  if (effectiveGeminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: effectiveGeminiKey });
      const contentsParts: any[] = [];

      // If reference image provided (Image-to-Image editing)
      if (referenceImageBase64) {
        contentsParts.push({
          inlineData: {
            mimeType: referenceImageMimeType,
            data: referenceImageBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
          },
        });
        contentsParts.push({
          text: `Modify this reference image precisely according to this instruction: ${optimized.enhancedPrompt}`,
        });
      } else {
        contentsParts.push({
          text: optimized.enhancedPrompt,
        });
      }

      // Try gemini-3.1-flash-image
      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: { parts: contentsParts },
        config: {
          imageConfig: {
            aspectRatio: dimensions.geminiRatio,
          },
        },
      });

      const parts = geminiResponse.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          mimeType = part.inlineData.mimeType || 'image/png';
          extension = mimeType.includes('png') ? 'png' : 'jpg';
          modelUsed = 'Gemini 3.1 Flash Image';
          break;
        }
      }
    } catch (geminiError: any) {
      console.warn('Gemini image generation attempt failed:', geminiError?.message || geminiError);
      // If user passed a specific Gemini key and it failed with quota/auth, we log and fallback to Diffusion
    }
  }

  // Attempt B: Real Diffusion Engine (FLUX / Turbo)
  if (!imageBuffer) {
    const diffusionModels = ['flux', 'turbo', 'flux-realism', 'flux-anime'];
    const cleanPrompt = optimized.enhancedPrompt.slice(0, 800);
    const randomSeed = Math.floor(Math.random() * 1000000);

    for (const m of diffusionModels) {
      try {
        let url = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=${
          dimensions.width
        }&height=${dimensions.height}&model=${m}&nologo=true&seed=${randomSeed}`;

        // If reference image URL exists, attach it
        if (referenceImageUrl && !referenceImageUrl.startsWith('data:')) {
          url += `&image=${encodeURIComponent(referenceImageUrl)}`;
        }

        const res = await fetch(url, {
          signal: AbortSignal.timeout(18000),
          headers: {
            Accept: 'image/*',
            'User-Agent': '3athlas-Agent/1.0',
          },
        });

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.startsWith('image/')) {
          const arrayBuf = await res.arrayBuffer();
          if (arrayBuf.byteLength > 1024) {
            imageBuffer = Buffer.from(arrayBuf);
            mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
            extension = mimeType.includes('png') ? 'png' : 'jpg';
            modelUsed = m === 'flux' ? 'FLUX.1 Neural Engine' : `Diffusion ${m.toUpperCase()}`;
            break;
          }
        }
      } catch (diffError) {
        console.warn(`Diffusion attempt with model ${m} failed, trying next...`);
      }
    }
  }

  // Step 3: Finalizing
  if (onStep) onStep('finalizing', '🎨 Finalizzo i dettagli...');

  // If still no buffer, fail fast with real error as strictly required by prompt
  if (!imageBuffer) {
    throw new Error(
      'Impossibile generare l\'immagine: i servizi di generazione grafica sono momentaneamente occupati o la quota API è esaurita. Puoi inserire una chiave API Gemini personale con quota attiva nelle Impostazioni.'
    );
  }

  // Save the image to uploads/images
  const fileName = `${imageId}.${extension}`;
  const filePath = path.join(IMAGES_DIR, fileName);
  fs.writeFileSync(filePath, imageBuffer);

  const imageRecord: GeneratedImage = {
    id: imageId,
    conversationId,
    messageId,
    prompt,
    enhancedPrompt: optimized.enhancedPrompt,
    aspectRatio: finalAspectRatio,
    imageUrl: `/api/images/${fileName}`,
    downloadUrl: `/api/images/download/${imageId}`,
    width: dimensions.width,
    height: dimensions.height,
    model: modelUsed,
    referenceImageId,
    referenceImageUrl,
    createdAt: new Date().toISOString(),
    generatedBy: '3 athlas',
  };

  return { image: imageRecord, filePath };
}
