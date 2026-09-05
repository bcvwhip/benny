// Web Speech API interface definitions
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: {
      new (): ISpeechRecognition;
    };
    webkitSpeechRecognition?: {
      new (): ISpeechRecognition;
    };
  }
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export class VoiceRecognizer {
  private recognition: ISpeechRecognition | null = null;
  private isListening = false;

  constructor(
    private lang: string = 'it-IT',
    private onTranscript: (transcript: string, isFinal: boolean) => void,
    private onError: (error: string) => void,
    private onStateChange: (listening: boolean) => void
  ) {
    if (isSpeechRecognitionSupported()) {
      const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionConstructor) {
        this.recognition = new SpeechRecognitionConstructor();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.lang;

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            this.onTranscript(finalTranscript, true);
          } else if (interimTranscript) {
            this.onTranscript(interimTranscript, false);
          }
        };

        this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          this.isListening = false;
          this.onStateChange(false);
          this.onError(`Errore riconoscimento vocale: ${event.error}`);
        };

        this.recognition.onend = () => {
          this.isListening = false;
          this.onStateChange(false);
        };
      }
    }
  }

  start() {
    if (!this.recognition) {
      this.onError('Il tuo browser non supporta il riconoscimento vocale');
      return;
    }
    try {
      this.recognition.lang = this.lang;
      this.recognition.start();
      this.isListening = true;
      this.onStateChange(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Impossibile avviare il microfono';
      this.onError(msg);
    }
  }

  stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignored
      }
      this.isListening = false;
      this.onStateChange(false);
    }
  }

  toggle(): boolean {
    if (this.isListening) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }
}

// Text to Speech
let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speakText(
  text: string,
  rate = 1.0,
  lang = 'it-IT',
  onStart?: () => void,
  onEnd?: () => void
) {
  if (!isSpeechSynthesisSupported()) return;

  stopSpeaking();

  // Strip markdown formatting for cleaner speech output
  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Codice sorgente omesso per la lettura.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*#_~>]/g, '')
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = lang;
  utterance.rate = Math.max(0.7, Math.min(rate, 1.6));

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onstart = () => {
    if (onStart) onStart();
  };

  utterance.onend = () => {
    currentUtterance = null;
    if (onEnd) onEnd();
  };

  utterance.onerror = () => {
    currentUtterance = null;
    if (onEnd) onEnd();
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported() && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}
