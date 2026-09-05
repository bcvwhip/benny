import { Check, Copy } from 'lucide-react';
import React, { useState } from 'react';

interface CodeBlockProps {
  language?: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language = 'code', value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#222222] bg-[#0F0F0F] shadow-xl text-xs sm:text-sm font-mono">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A] border-b border-[#222222] text-gray-300">
        <div className="flex items-center space-x-2.5">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider pl-1">
            {language}
          </span>
        </div>

        <button
          id={`copy-code-${language}`}
          onClick={handleCopy}
          aria-label="Copia codice"
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-white hover:bg-[#262626] transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-[11px]">Copiato!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px]">Copia</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="p-4 overflow-x-auto text-blue-300/90 leading-relaxed font-['JetBrains_Mono'] text-xs sm:text-sm">
        <pre>
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
};
