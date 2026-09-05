import React from 'react';
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Code,
  File,
  CheckCircle,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';
import { FileAttachment } from '../types.js';

interface FileAttachmentCardProps {
  attachment: FileAttachment;
  onRemove?: () => void;
  statusText?: string;
  isAnalyzing?: boolean;
}

export const FileAttachmentCard: React.FC<FileAttachmentCardProps> = ({
  attachment,
  onRemove,
  statusText,
  isAnalyzing = false,
}) => {
  const getCategoryInfo = () => {
    switch (attachment.fileCategory) {
      case 'pdf':
        return {
          label: 'Documento PDF',
          color: 'text-rose-400',
          bg: 'bg-rose-500/10 border-rose-500/20',
          icon: <FileText className="w-5 h-5 text-rose-400" />,
        };
      case 'docx':
        return {
          label: 'Documento Word',
          color: 'text-blue-400',
          bg: 'bg-blue-500/10 border-blue-500/20',
          icon: <FileText className="w-5 h-5 text-blue-400" />,
        };
      case 'xlsx':
        return {
          label: 'Foglio Excel',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          icon: <FileSpreadsheet className="w-5 h-5 text-emerald-400" />,
        };
      case 'csv':
        return {
          label: 'File Tabellare CSV',
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/10 border-cyan-500/20',
          icon: <FileSpreadsheet className="w-5 h-5 text-cyan-400" />,
        };
      case 'image':
        return {
          label: 'Immagine',
          color: 'text-purple-400',
          bg: 'bg-purple-500/10 border-purple-500/20',
          icon: <ImageIcon className="w-5 h-5 text-purple-400" />,
        };
      case 'code':
        return {
          label: 'File Codice',
          color: 'text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/20',
          icon: <Code className="w-5 h-5 text-amber-400" />,
        };
      default:
        return {
          label: 'Documento Testo',
          color: 'text-gray-300',
          bg: 'bg-gray-500/10 border-gray-500/20',
          icon: <File className="w-5 h-5 text-gray-400" />,
        };
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const cat = getCategoryInfo();

  return (
    <div className="relative group rounded-xl bg-[#141414] border border-[#262626] p-3 shadow-md hover:border-gray-600 transition-all duration-200 min-w-[260px] max-w-sm">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[#1D1D1D] border border-[#2D2D2D] flex items-center justify-center shrink-0">
            {cat.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-100 truncate max-w-[190px]" title={attachment.originalName}>
              📄 {attachment.originalName}
            </div>
            <div className="flex items-center space-x-1.5 mt-0.5 text-[11px] text-gray-400">
              <span className="font-mono">📊 {cat.label}</span>
              <span>•</span>
              <span className="font-mono text-gray-400">📦 {formatSize(attachment.size)}</span>
            </div>
          </div>
        </div>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-400 hover:text-rose-400 p-1 rounded-md hover:bg-[#1E1E1E] transition-colors"
            title="Rimuovi file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Analysis status indicator */}
      <div className="mt-2.5 pt-2 border-t border-[#1F1F1F] flex items-center justify-between text-[11px]">
        {isAnalyzing ? (
          <div className="flex items-center space-x-1.5 text-cyan-400 font-mono animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>⏳ {statusText || 'Analizzo il file...'}</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-emerald-400 font-mono">
            <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate max-w-[220px]">
              {statusText || attachment.analysisSummary || '⏳ Operazione completata.'}
            </span>
          </div>
        )}

        {attachment.pageCount && (
          <span className="text-[10px] text-gray-400 font-mono">
            {attachment.pageCount} pag.
          </span>
        )}
        {attachment.rowCount && (
          <span className="text-[10px] text-gray-400 font-mono">
            {attachment.rowCount} righe
          </span>
        )}
      </div>
    </div>
  );
};
