import { VoiceOrbState, VoicePersonality, VoicePersonalityId, VoiceSettings } from '../types.js';

export const VOICE_PERSONALITIES: Record<VoicePersonalityId, VoicePersonality> = {
  aria: {
    id: 'aria',
    name: 'Aria',
    tagline: 'Calma e professionale',
    description: 'Timbro equilibrato, rassicurante e analitico per lavoro, studio e riflessione.',
    pitch: 1.0,
    rate: 1.0,
    color: '#00F2FE',
    gender: 'female',
    recommendedVoiceKeywords: ['alice', 'federica', 'cosimo', 'female', 'natural', 'google', 'it-IT'],
  },
  nova: {
    id: 'nova',
    name: 'Nova',
    tagline: 'Energica e moderna',
    description: 'Cadenza vivace, brillante e stimolante per brainstorming e creatività.',
    pitch: 1.14,
    rate: 1.06,
    color: '#9D4EDD',
    gender: 'female',
    recommendedVoiceKeywords: ['elena', 'chiara', 'giulia', 'young', 'it-IT'],
  },
  orion: {
    id: 'orion',
    name: 'Orion',
    tagline: 'Profonda e autorevole',
    description: 'Tono caldo, solenne e profondo con presenza calma e decisa.',
    pitch: 0.85,
    rate: 0.95,
    color: '#3B82F6',
    gender: 'male',
    recommendedVoiceKeywords: ['giorgio', 'diego', 'carlo', 'male', 'it-IT'],
  },
  luna: {
    id: 'luna',
    name: 'Luna',
    tagline: 'Dolce e rassicurante',
    description: 'Voce morbida, empatica e fluida per conversazioni distese e confidenziali.',
    pitch: 1.06,
    rate: 0.92,
    color: '#10B981',
    gender: 'female',
    recommendedVoiceKeywords: ['lucia', 'paola', 'silvia', 'soft', 'it-IT'],
  },
};

// Recognition interface
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
    SpeechRecognition?: { new (): ISpeechRecognition };
    webkitSpeechRecognition?: { new (): ISpeechRecognition };
  }
}

export interface VoiceEngineCallbacks {
  onStateChange: (state: VoiceOrbState) => void;
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onSpeechComplete: (text: string) => void;
  onAudioData: (level: number, frequencies: Uint8Array) => void;
  onBargeIn: () => void;
  onWordBoundary?: (charIndex: number, length: number) => void;
  onTtsStart: () => void;
  onTtsEnd: () => void;
  onError: (errorMessage: string) => void;
  onVoiceCommand?: (command: 'exit_voice' | 'new_chat' | 'stop_speaking' | 'summarize') => void;
}

export class VoiceEngine {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private recognition: ISpeechRecognition | null = null;

  private state: VoiceOrbState = 'idle';
  private callbacks: VoiceEngineCallbacks;
  private settings: VoiceSettings;
  private isMuted: boolean = false;
  private isDestroyed: boolean = false;

  private animationFrameId: number | null = null;
  private freqData: Uint8Array = new Uint8Array(64);
  private currentVolume: number = 0;

  // VAD state
  private isSpeakingVAD: boolean = false;
  private speechStartTime: number = 0;
  private silenceStartTime: number = 0;
  private accumulatedTranscript: string = '';
  private vadSilenceTimeoutId: any = null;

  // TTS state
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private ttsSyntheticTimer: any = null;
  private ttsSimulatedVolume: number = 0;

  constructor(callbacks: VoiceEngineCallbacks, initialSettings?: Partial<VoiceSettings>) {
    this.callbacks = callbacks;
    this.settings = {
      personality: 'aria',
      continuousConversation: true,
      bargeInEnabled: true,
      autoSpeakResponse: true,
      micSensitivity: 0.75,
      soundEffects: true,
      ...initialSettings,
    };
  }

  public updateSettings(newSettings: Partial<VoiceSettings>) {
    this.settings = { ...this.settings, ...newSettings };
  }

  public getState(): VoiceOrbState {
    return this.state;
  }

  public setState(newState: VoiceOrbState) {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange(newState);
    }
  }

  public async start(): Promise<boolean> {
    try {
      this.isDestroyed = false;
      await this.initMicrophone();
      this.initRecognition();
      this.startAudioLoop();
      this.startListening();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Impossibile accedere al microfono';
      this.callbacks.onError(msg);
      return false;
    }
  }

  private async initMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Il browser non supporta la cattura audio (getUserMedia)');
    }

    // Request high-quality speech constraints
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    const source = this.audioCtx.createMediaStreamSource(this.micStream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.75;
    source.connect(this.analyser);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  private initRecognition() {
    const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      return; // Fallback or notification handled gracefully
    }

    this.recognition = new SpeechRecognitionConstructor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'it-IT';

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (this.isMuted) return;

      let interim = '';
      let finalStr = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalStr += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      if (interim) {
        this.callbacks.onInterimTranscript(interim);
        this.checkVoiceCommands(interim);
      }

      if (finalStr) {
        const trimmed = finalStr.trim();
        if (trimmed) {
          this.accumulatedTranscript += (this.accumulatedTranscript ? ' ' : '') + trimmed;
          this.callbacks.onFinalTranscript(this.accumulatedTranscript);
          this.checkVoiceCommands(this.accumulatedTranscript);

          // Reset silence timer on speech
          this.resetSilenceTimer();
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        // Expected during silence, ignore
        return;
      }
      if (event.error === 'aborted') {
        return;
      }
      console.warn('SpeechRecognition warning:', event.error);
    };

    this.recognition.onend = () => {
      // Auto-restart if we should still be listening and not destroyed
      if (!this.isDestroyed && !this.isMuted && (this.state === 'listening' || this.state === 'idle')) {
        try {
          this.recognition?.start();
        } catch {
          // Ignored if already started
        }
      }
    };
  }

  private checkVoiceCommands(text: string): boolean {
    const lower = text.toLowerCase().trim();

    if (
      lower.includes('passa alla modalità testo') ||
      lower.includes('torna al testo') ||
      lower.includes('modalità testo') ||
      lower.includes('chiudi voce')
    ) {
      this.callbacks.onVoiceCommand?.('exit_voice');
      return true;
    }

    if (
      lower.includes('crea una lista') ||
      lower.includes('nuova chat') ||
      lower.includes('nuova conversazione')
    ) {
      this.callbacks.onVoiceCommand?.('new_chat');
      return true;
    }

    if (
      lower.includes('fermati') ||
      lower.includes('silenzio') ||
      lower.includes('stop') ||
      lower.includes('aspetta un attimo')
    ) {
      this.stopSpeaking();
      this.callbacks.onVoiceCommand?.('stop_speaking');
      return true;
    }

    if (lower.includes('riassumi questa conversazione') || lower.includes('fai un riassunto')) {
      this.callbacks.onVoiceCommand?.('summarize');
      return true;
    }

    return false;
  }

  private startAudioLoop() {
    const loop = () => {
      if (this.isDestroyed) return;

      let level = 0;

      if (this.state === 'speaking') {
        // While speaking, we simulate acoustic dynamic frequencies for the TTS voice cadence
        level = this.ttsSimulatedVolume;
        // Generate simulated dynamic frequencies reflecting spoken phonemes
        for (let i = 0; i < this.freqData.length; i++) {
          const harmonic = Math.sin(Date.now() * 0.015 + i * 0.4) * 0.5 + 0.5;
          this.freqData[i] = Math.floor(level * 255 * harmonic);
        }
        this.callbacks.onAudioData(level, this.freqData);

        // Check barge-in: If user actually speaks over TTS
        if (this.settings.bargeInEnabled && this.analyser && !this.isMuted) {
          const tempBuffer = new Uint8Array(this.analyser.frequencyBinCount);
          this.analyser.getByteFrequencyData(tempBuffer);
          let sum = 0;
          for (let i = 0; i < tempBuffer.length; i++) sum += tempBuffer[i];
          const micLevel = sum / (tempBuffer.length * 255);

          const threshold = 0.08 + (1 - this.settings.micSensitivity) * 0.08;
          if (micLevel > threshold) {
            console.log('[Barge-In] Voice detected over TTS! Interrupting...');
            this.handleBargeIn();
          }
        }
      } else if (this.analyser && !this.isMuted) {
        // Read real microphone frequency data
        this.analyser.getByteFrequencyData(this.freqData);

        let sum = 0;
        for (let i = 0; i < this.freqData.length; i++) {
          sum += this.freqData[i];
        }
        level = sum / (this.freqData.length * 255);
        this.currentVolume = level;
        this.callbacks.onAudioData(level, this.freqData);

        // VAD (Voice Activity Detection) logic
        this.processVAD(level);
      } else {
        // Idle/Muted: subtle breathing data
        this.callbacks.onAudioData(0, this.freqData);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private processVAD(level: number) {
    if (this.state !== 'listening') return;

    // Threshold adjusted by mic sensitivity (0.0 to 1.0)
    const threshold = 0.04 + (1 - this.settings.micSensitivity) * 0.06;

    if (level > threshold) {
      if (!this.isSpeakingVAD) {
        this.isSpeakingVAD = true;
        this.speechStartTime = Date.now();
        if (this.vadSilenceTimeoutId) {
          clearTimeout(this.vadSilenceTimeoutId);
          this.vadSilenceTimeoutId = null;
        }
      }
    } else {
      if (this.isSpeakingVAD) {
        if (!this.silenceStartTime) {
          this.silenceStartTime = Date.now();
        }
        // If user has spoken something and stopped for > 1.3 seconds, trigger automatic commit
        if (this.accumulatedTranscript.trim() && !this.vadSilenceTimeoutId) {
          this.vadSilenceTimeoutId = setTimeout(() => {
            this.commitSpeech();
          }, 1400);
        }
      }
    }
  }

  private resetSilenceTimer() {
    if (this.vadSilenceTimeoutId) {
      clearTimeout(this.vadSilenceTimeoutId);
      this.vadSilenceTimeoutId = null;
    }
    // Set fresh timer
    this.vadSilenceTimeoutId = setTimeout(() => {
      if (this.accumulatedTranscript.trim()) {
        this.commitSpeech();
      }
    }, 1500);
  }

  public commitSpeech() {
    if (this.vadSilenceTimeoutId) {
      clearTimeout(this.vadSilenceTimeoutId);
      this.vadSilenceTimeoutId = null;
    }

    const textToSubmit = this.accumulatedTranscript.trim();
    this.accumulatedTranscript = '';
    this.isSpeakingVAD = false;
    this.silenceStartTime = 0;

    if (textToSubmit) {
      this.setState('thinking');
      this.callbacks.onSpeechComplete(textToSubmit);
    }
  }

  private handleBargeIn() {
    this.stopSpeaking();
    this.callbacks.onBargeIn();
    this.accumulatedTranscript = '';
    this.startListening();
  }

  public startListening() {
    this.isSpeakingVAD = false;
    this.silenceStartTime = 0;
    this.accumulatedTranscript = '';
    this.setState('listening');

    if (this.recognition && !this.isMuted) {
      try {
        this.recognition.start();
      } catch {
        // Already started
      }
    }
  }

  public stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignored
      }
    }
    if (this.vadSilenceTimeoutId) {
      clearTimeout(this.vadSilenceTimeoutId);
      this.vadSilenceTimeoutId = null;
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopListening();
      if (this.state === 'listening') {
        this.setState('idle');
      }
    } else {
      if (this.state === 'idle') {
        this.startListening();
      }
    }
  }

  public speak(
    text: string,
    personalityId?: VoicePersonalityId,
    onWordHighlight?: (charIndex: number, length: number) => void
  ) {
    if (!('speechSynthesis' in window)) {
      this.callbacks.onError('Sintesi vocale non supportata da questo browser');
      return;
    }

    this.stopSpeaking();
    this.setState('speaking');
    this.callbacks.onTtsStart();

    // Clean text for speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Codice sorgente allegato nella chat.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*#_~>]/g, '')
      .replace(/https?:\/\/[^\s]+/g, 'link web')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      this.handleTtsFinished();
      return;
    }

    const personality = VOICE_PERSONALITIES[personalityId || this.settings.personality] || VOICE_PERSONALITIES.aria;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'it-IT';
    utterance.rate = personality.rate;
    utterance.pitch = personality.pitch;

    // Pick best available Italian voice
    const voices = window.speechSynthesis.getVoices();
    const itVoices = voices.filter((v) => v.lang.startsWith('it') || v.lang.includes('IT'));

    let chosenVoice = itVoices.find((v) => {
      const vName = v.name.toLowerCase();
      return personality.recommendedVoiceKeywords.some((kw) => vName.includes(kw.toLowerCase()));
    });

    if (!chosenVoice && itVoices.length > 0) {
      chosenVoice = itVoices[0];
    }
    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }

    // Setup speech wave cadence simulation
    this.startTtsSimulation();

    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name === 'word') {
        // Accentuate wave pulse on each word
        this.ttsSimulatedVolume = Math.min(1.0, 0.45 + Math.random() * 0.45);
        if (onWordHighlight) {
          onWordHighlight(event.charIndex, event.charLength || 5);
        }
        this.callbacks.onWordBoundary?.(event.charIndex, event.charLength || 5);
      }
    };

    utterance.onend = () => {
      this.stopTtsSimulation();
      this.currentUtterance = null;
      this.callbacks.onTtsEnd();
      this.handleTtsFinished();
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      this.stopTtsSimulation();
      this.currentUtterance = null;
      this.callbacks.onTtsEnd();
      this.handleTtsFinished();
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  private startTtsSimulation() {
    this.stopTtsSimulation();
    this.ttsSimulatedVolume = 0.4;
    this.ttsSyntheticTimer = setInterval(() => {
      // Natural speech envelope wave
      const t = Date.now() * 0.008;
      const base = Math.sin(t) * 0.25 + 0.4;
      const modulation = Math.sin(t * 2.3) * 0.15;
      this.ttsSimulatedVolume = Math.max(0.1, Math.min(0.9, base + modulation));
    }, 60);
  }

  private stopTtsSimulation() {
    if (this.ttsSyntheticTimer) {
      clearInterval(this.ttsSyntheticTimer);
      this.ttsSyntheticTimer = null;
    }
    this.ttsSimulatedVolume = 0;
  }

  public stopSpeaking() {
    this.stopTtsSimulation();
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }

  private handleTtsFinished() {
    // If continuous conversation is on, return smoothly to listening
    if (this.settings.continuousConversation && !this.isMuted) {
      setTimeout(() => {
        if (this.state === 'speaking' || this.state === 'thinking') {
          this.startListening();
        }
      }, 400);
    } else {
      this.setState('idle');
    }
  }

  public destroy() {
    this.isDestroyed = true;
    this.stopSpeaking();
    this.stopListening();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
