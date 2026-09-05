import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Presentation, CheckCircle, Loader2 } from 'lucide-react';
import { GeneratedFile } from '../types.js';

interface GeneratedFileCardProps {
  file: GeneratedFile;
}

export const GeneratedFileCard: React.FC<GeneratedFileCardProps> = ({ file }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const getFormatDetails = () => {
    switch (file.format) {
      case 'docx':
        return {
          label: 'Microsoft Word (.docx)',
          icon: <FileText className="w-6 h-6 text-blue-400" />,
          badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        };
      case 'xlsx':
        return {
          label: 'Microsoft Excel (.xlsx)',
          icon: <FileSpreadsheet className="w-6 h-6 text-emerald-400" />,
          badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      case 'pptx':
        return {
          label: 'Presentazione PowerPoint (.pptx)',
          icon: <Presentation className="w-6 h-6 text-amber-400" />,
          badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        };
      case 'pdf':
        return {
          label: 'Documento PDF (.pdf)',
          icon: <FileText className="w-6 h-6 text-rose-400" />,
          badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
      case 'csv':
        return {
          label: 'File Tabellare CSV (.csv)',
          icon: <FileSpreadsheet className="w-6 h-6 text-cyan-400" />,
          badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        };
      default:
        return {
          label: `File ${file.format.toUpperCase()}`,
          icon: <FileText className="w-6 h-6 text-gray-300" />,
          badgeColor: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
        };
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      // Trigger native download
      const downloadLink = document.createElement('a');
      downloadLink.href = file.downloadUrl;
      downloadLink.setAttribute('download', file.originalName);
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (e) {
      console.error('Download error:', e);
    } finally {
      setTimeout(() => setIsDownloading(false), 1000);
    }
  };

  const details = getFormatDetails();

  return (
    <div className="my-3 w-full max-w-lg rounded-xl bg-gradient-to-b from-[#141414] to-[#0D0D0D] border border-[#262626] p-4 shadow-xl hover:border-gray-600 transition-all duration-300">
      {/* Top row: Icon & file details */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3.5 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E] flex items-center justify-center shrink-0 shadow-inner">
            {details.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-white truncate max-w-[260px] tracking-tight">
                📄 {file.originalName}
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-1 text-xs text-gray-400">
              <span className="font-mono">📁 {details.label}</span>
              <span>•</span>
              <span className="font-mono text-gray-400">{formatSize(file.size)}</span>
            </div>
          </div>
        </div>

        {/* Generato da 3 athlas Badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium shrink-0">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>Generato da 3 athlas</span>
        </div>
      </div>

      {file.description && (
        <p className="mt-2 text-xs text-gray-400 pl-1 border-l-2 border-gray-700 leading-relaxed">
          {file.description}
        </p>
      )}

      {/* Action button */}
      <div className="mt-3.5 pt-3 border-t border-[#1F1F1F] flex items-center justify-between">
        <span className="text-[11px] text-gray-400 font-mono">
          Pronto per il salvataggio locale
        </span>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-white hover:bg-gray-100 active:bg-gray-200 text-black text-xs font-semibold shadow-md transition-all duration-200 disabled:opacity-50"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Download in corso...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5 text-black" />
              <span>⬇️ Scarica file</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
