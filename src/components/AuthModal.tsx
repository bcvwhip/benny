import { AlertCircle, Lock, Mail, User as UserIcon, X } from 'lucide-react';
import React, { useState } from 'react';
import { createGuestUser, loginUser, registerUser } from '../lib/api.js';
import { AuthResponse } from '../types.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (authData: AuthResponse) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isRegister) {
        const data = await registerUser(email, password, name);
        onAuthSuccess(data);
      } else {
        const data = await loginUser(email, password);
        onAuthSuccess(data);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore autenticazione';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestAccess = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await createGuestUser();
      onAuthSuccess(data);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore accesso ospite';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#111111] border border-[#222222] rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1A1A1A] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center font-bold text-2xl shadow-[0_0_20px_rgba(255,255,255,0.2)] mb-3">
            3
          </div>
          <h3 className="text-xl font-light tracking-tight text-white">
            <span className="font-bold">3</span> <span className="italic">athlas</span> <span className="text-gray-400 text-sm">{isRegister ? 'registrazione' : 'accesso'}</span>
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {isRegister
              ? 'Salva le tue conversazioni nel database e accedi da ovunque.'
              : 'Bentornato nella tua piattaforma AI intelligente.'}
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
                Nome o Pseudonimo
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Es. Marco Rossi"
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] text-gray-100 placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@esempio.com"
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] text-gray-100 placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 font-mono">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caratteri"
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] text-gray-100 placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs tracking-wide hover:bg-gray-200 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 mt-4 cursor-pointer"
          >
            {isLoading
              ? 'Elaborazione in corso...'
              : isRegister
              ? 'Crea Account'
              : 'Accedi'}
          </button>
        </form>

        {/* Toggle between login & register */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-xs text-gray-300 hover:text-white underline underline-offset-2"
          >
            {isRegister
              ? 'Hai già un account? Accedi qui'
              : 'Non hai un account? Registrati ora'}
          </button>
        </div>

        {/* Guest access option */}
        <div className="mt-5 pt-4 border-t border-[#222222] text-center">
          <button
            type="button"
            onClick={handleGuestAccess}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Oppure continua come <span className="text-gray-200 underline">Ospite temporaneo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
