import fs from 'fs';
import path from 'path';
import { FileAttachment, FileCategory, GeneratedFile, GeneratedFileFormat } from '../types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');

// Ensure directory exists
if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

export function detectFileCategory(filename: string, mimeType: string): FileCategory {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf' || mimeType === 'application/pdf') return 'pdf';
  if (['.docx', '.doc'].includes(ext) || mimeType.includes('word')) return 'docx';
  if (['.xlsx', '.xls'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'xlsx';
  if (ext === '.csv' || mimeType === 'text/csv') return 'csv';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext) || mimeType.startsWith('image/')) return 'image';
  if (['.js', '.ts', '.py', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.sql', '.sh'].includes(ext)) return 'code';
  if (['.txt', '.md', '.rtf'].includes(ext) || mimeType.startsWith('text/')) return 'txt';
  return 'other';
}

export async function parseFileContent(
  filePath: string,
  originalName: string,
  mimeType: string
): Promise<{
  category: FileCategory;
  extractedText: string;
  pageCount?: number;
  rowCount?: number;
  wordCount?: number;
  sheets?: string[];
  analysisSummary: string;
}> {
  const category = detectFileCategory(originalName, mimeType);
  const ext = path.extname(originalName).toLowerCase();

  try {
    if (category === 'pdf') {
      const pdfParseModule: any = await import('pdf-parse');
      const PDFParseClass = pdfParseModule.PDFParse || pdfParseModule.default || pdfParseModule;
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParseClass({ data: buffer });
      const textResult = await parser.getText();
      const rawText = textResult?.text || '';
      const pageCount = textResult?.total || 1;
      const cleanText = rawText.replace(/\r\n/g, '\n').trim();
      const words = cleanText ? cleanText.split(/\s+/).length : 0;
      await parser.destroy?.().catch(() => {});

      return {
        category,
        extractedText: cleanText.slice(0, 150000), // Cap for token optimization
        pageCount,
        wordCount: words,
        analysisSummary: `Documento PDF analizzato con successo: ${pageCount} pagine, ${words.toLocaleString()} parole lette.`,
      };
    }

    if (category === 'docx') {
      const mammoth = await import('mammoth');
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      const rawText = (result.value || '').trim();
      const words = rawText ? rawText.split(/\s+/).length : 0;
      const paragraphs = rawText.split(/\n\s*\n/).filter(Boolean).length;

      return {
        category,
        extractedText: rawText.slice(0, 150000),
        wordCount: words,
        analysisSummary: `Documento Word (.docx) analizzato: ${paragraphs} paragrafi, ${words.toLocaleString()} parole lette.`,
      };
    }

    if (category === 'xlsx' || category === 'csv') {
      const xlsx = await import('xlsx');
      const buffer = fs.readFileSync(filePath);
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheets = workbook.SheetNames || [];

      let combinedTablesText = '';
      let totalRows = 0;

      for (const sheetName of sheets) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const jsonData: Array<Record<string, unknown>> = xlsx.utils.sheet_to_json(sheet);
        totalRows += jsonData.length;

        // Build Markdown table representation for LLM understanding
        combinedTablesText += `\n### FOGLIO: "${sheetName}" (${jsonData.length} righe)\n`;
        if (jsonData.length > 0) {
          const headers = Object.keys(jsonData[0]);
          combinedTablesText += `| ${headers.join(' | ')} |\n`;
          combinedTablesText += `| ${headers.map(() => '---').join(' | ')} |\n`;

          // Include up to first 250 rows for precise data analysis
          const sampleRows = jsonData.slice(0, 250);
          for (const row of sampleRows) {
            const rowValues = headers.map((h) => {
              const val = row[h];
              if (val === undefined || val === null) return '';
              return String(val).replace(/\|/g, '\\|').replace(/\n/g, ' ');
            });
            combinedTablesText += `| ${rowValues.join(' | ')} |\n`;
          }

          if (jsonData.length > 250) {
            combinedTablesText += `\n*(...ulteriori ${jsonData.length - 250} righe presenti nel foglio)*\n`;
          }
        } else {
          combinedTablesText += `*(Foglio vuoto o senza dati tabellari riconosciuti)*\n`;
        }
      }

      return {
        category,
        extractedText: combinedTablesText.trim(),
        rowCount: totalRows,
        sheets,
        analysisSummary: `Foglio di calcolo analizzato: ${sheets.length} fogli (${sheets.join(', ')}), ${totalRows.toLocaleString()} righe totali elaborate.`,
      };
    }

    if (category === 'txt' || category === 'code') {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const clean = raw.trim();
      const lines = clean.split('\n').length;
      const words = clean ? clean.split(/\s+/).length : 0;

      return {
        category,
        extractedText: clean.slice(0, 150000),
        rowCount: lines,
        wordCount: words,
        analysisSummary: `File di testo / codice analizzato: ${lines} righe, ${words.toLocaleString()} parole lette.`,
      };
    }

    if (category === 'image') {
      const stats = fs.statSync(filePath);
      return {
        category,
        extractedText: `[Immagine allegata: "${originalName}", formato ${ext.toUpperCase().replace('.', '')}, dimensione ${(stats.size / 1024).toFixed(1)} KB. L'immagine è stata memorizzata nel contesto della conversazione.]`,
        analysisSummary: `Immagine ${ext.toUpperCase().replace('.', '')} registrata nel contesto visivo di 3 athlas.`,
      };
    }

    // Default fallback
    const raw = fs.readFileSync(filePath, 'utf-8');
    return {
      category: 'other',
      extractedText: raw.slice(0, 50000),
      analysisSummary: `File analizzato e caricato nel contesto.`,
    };
  } catch (err) {
    console.error('Error parsing file:', err);
    return {
      category,
      extractedText: `[File: "${originalName}" caricato. Non è stato possibile estrarre il testo completo: ${(err as Error).message}]`,
      analysisSummary: `File caricato con estrazione parziale o protetto.`,
    };
  }
}

// --------------------------------------------------------------------------
// Real File Generation Engine (DOCX, XLSX, PPTX, PDF, CSV, TXT, JSON, MD)
// --------------------------------------------------------------------------

export interface GenerateFileOptions {
  format: GeneratedFileFormat;
  filename?: string;
  title?: string;
  description?: string;
  content: string; // Markdown text or structured content
  structuredData?: {
    sheets?: Array<{
      name: string;
      headers: string[];
      rows: Array<Array<string | number>>;
    }>;
    slides?: Array<{
      title: string;
      subtitle?: string;
      bullets?: string[];
      notes?: string;
    }>;
  };
}

export async function generateDocument(options: GenerateFileOptions): Promise<{
  fileRecord: GeneratedFile;
  filePath: string;
}> {
  const { format, title = 'Documento 3 athlas', description, content } = options;
  const fileId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let cleanFilename = (options.filename || `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${format}`).trim();
  // Ensure correct extension
  if (!cleanFilename.endsWith(`.${format}`)) {
    cleanFilename = `${cleanFilename.replace(/\.[^/.]+$/, '')}.${format}`;
  }

  const outputFilePath = path.join(GENERATED_DIR, `${fileId}_${cleanFilename}`);

  if (format === 'docx') {
    const docx = await import('docx');
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = docx;

    const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];

    // Title Block
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 36, // 18pt
            color: '0F172A',
            font: 'Arial',
          }),
        ],
        spacing: { after: 120 },
      })
    );

    // Subtitle / Creator Banner
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Generato da 3 athlas • Creato da Benoit Valendino • Data: ${new Date().toLocaleDateString('it-IT')}`,
            italics: true,
            size: 20,
            color: '64748B',
            font: 'Arial',
          }),
        ],
        spacing: { after: 300 },
      })
    );

    // Parse markdown-like content into sections, headings, bullets and tables
    const lines = content.split('\n');
    let inTable = false;
    const tableRowsBuffer: string[][] = [];

    const flushTable = () => {
      if (tableRowsBuffer.length === 0) return;
      const rows = tableRowsBuffer.map((rowCells, rIdx) => {
        const isHeader = rIdx === 0;
        return new TableRow({
          tableHeader: isHeader,
          children: rowCells.map(
            (cellText) =>
              new TableCell({
                width: { size: Math.floor(100 / Math.max(rowCells.length, 1)), type: WidthType.PERCENTAGE },
                shading: isHeader ? { fill: '0F172A' } : (rIdx % 2 === 0 ? { fill: 'F8FAFC' } : { fill: 'FFFFFF' }),
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
                  left: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
                  right: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
                },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cellText.trim(),
                        bold: isHeader,
                        color: isHeader ? 'FFFFFF' : '1E293B',
                        size: isHeader ? 20 : 19,
                        font: 'Arial',
                      }),
                    ],
                    spacing: { before: 80, after: 80 },
                  }),
                ],
              })
          ),
        });
      });

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        })
      );
      children.push(new Paragraph({ spacing: { after: 180 } }));
      tableRowsBuffer.length = 0;
      inTable = false;
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Check if table row
      if (line.startsWith('|') && line.endsWith('|')) {
        if (line.includes('---')) continue; // skip markdown divider
        const cells = line.split('|').slice(1, -1).map((c) => c.trim());
        tableRowsBuffer.push(cells);
        inTable = true;
        continue;
      } else if (inTable) {
        flushTable();
      }

      if (!line) {
        children.push(new Paragraph({ spacing: { after: 120 } }));
        continue;
      }

      if (line.startsWith('### ')) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [
              new TextRun({
                text: line.replace('### ', ''),
                bold: true,
                size: 24,
                color: '0284C7',
                font: 'Arial',
              }),
            ],
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (line.startsWith('## ')) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: line.replace('## ', ''),
                bold: true,
                size: 28,
                color: '0369A1',
                font: 'Arial',
              }),
            ],
            spacing: { before: 240, after: 120 },
          })
        );
      } else if (line.startsWith('# ')) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: line.replace('# ', ''),
                bold: true,
                size: 32,
                color: '0F172A',
                font: 'Arial',
              }),
            ],
            spacing: { before: 300, after: 140 },
          })
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: line.substring(2),
                size: 22,
                color: '334155',
                font: 'Arial',
              }),
            ],
            spacing: { after: 80 },
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: 22,
                color: '1E293B',
                font: 'Arial',
              }),
            ],
            spacing: { after: 140 },
          })
        );
      }
    }

    if (inTable) flushTable();

    const doc = new Document({
      creator: '3 athlas - Benoit Valendino',
      title,
      description: description || 'Documento creato con 3 athlas',
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputFilePath, buffer);
  } else if (format === 'xlsx') {
    const xlsx = await import('xlsx');
    const wb = xlsx.utils.book_new();

    if (options.structuredData?.sheets && options.structuredData.sheets.length > 0) {
      for (const sheetDef of options.structuredData.sheets) {
        const aoa: Array<Array<string | number>> = [sheetDef.headers, ...sheetDef.rows];
        const ws = xlsx.utils.aoa_to_sheet(aoa);
        xlsx.utils.book_append_sheet(wb, ws, sheetDef.name || 'Dati');
      }
    } else {
      // Parse tables from content markdown
      const lines = content.split('\n');
      const tableRows: Array<Array<string | number>> = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|') && trimmed.endsWith('|') && !trimmed.includes('---')) {
          const cells = trimmed
            .split('|')
            .slice(1, -1)
            .map((c) => {
              const val = c.trim();
              const num = Number(val.replace(',', '.'));
              return !isNaN(num) && val !== '' ? num : val;
            });
          tableRows.push(cells);
        }
      }

      if (tableRows.length > 0) {
        const ws = xlsx.utils.aoa_to_sheet(tableRows);
        xlsx.utils.book_append_sheet(wb, ws, 'Dati 3 athlas');
      } else {
        // Fallback: split content by lines and commas or colons
        const fallbackRows = lines
          .filter((l) => l.trim().length > 0)
          .map((l) => [l.trim()]);
        const ws = xlsx.utils.aoa_to_sheet([['Dati Estratti e Organizzati'], ...fallbackRows]);
        xlsx.utils.book_append_sheet(wb, ws, 'Sommario');
      }
    }

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    fs.writeFileSync(outputFilePath, buffer);
  } else if (format === 'pptx') {
    const pptxModule: any = await import('pptxgenjs');
    const PptxGen = pptxModule.default || pptxModule;
    const pres = new PptxGen();
    pres.layout = 'LAYOUT_16x9';

    // Slide 1: Cover Title Slide
    const slide1 = pres.addSlide();
    slide1.background = { color: '0A0A0A' };
    slide1.addText('3 ATHLAS INTELLIGENCE', {
      x: 1.0,
      y: 1.4,
      w: 8.5,
      h: 0.5,
      fontSize: 14,
      color: '38BDF8',
      bold: true,
      fontFace: 'Arial',
    });
    slide1.addText(title, {
      x: 1.0,
      y: 2.0,
      w: 8.5,
      h: 1.5,
      fontSize: 34,
      color: 'F8FAFC',
      bold: true,
      fontFace: 'Arial',
    });
    slide1.addText(
      description || 'Presentazione analitica e strategica generata da 3 athlas • Creato da Benoit Valendino',
      {
        x: 1.0,
        y: 3.8,
        w: 8.5,
        h: 0.8,
        fontSize: 16,
        color: '94A3B8',
        fontFace: 'Arial',
      }
    );

    // Determine slides from structured data or markdown sections
    const slidesData = options.structuredData?.slides || [];

    if (slidesData.length > 0) {
      for (const s of slidesData) {
        const slide = pres.addSlide();
        slide.background = { color: '0F172A' };
        slide.addText(s.title, {
          x: 0.8,
          y: 0.6,
          w: 8.5,
          h: 0.8,
          fontSize: 26,
          color: '38BDF8',
          bold: true,
          fontFace: 'Arial',
        });
        if (s.subtitle) {
          slide.addText(s.subtitle, {
            x: 0.8,
            y: 1.3,
            w: 8.5,
            h: 0.5,
            fontSize: 15,
            color: '94A3B8',
            fontFace: 'Arial',
          });
        }
        if (s.bullets && s.bullets.length > 0) {
          const bulletItems = s.bullets.map((b) => ({
            text: `${b}\n`,
            options: { bullet: true, color: 'E2E8F0', fontSize: 16 },
          }));
          slide.addText(bulletItems, {
            x: 0.8,
            y: s.subtitle ? 2.0 : 1.6,
            w: 8.5,
            h: 4.0,
          });
        }
      }
    } else {
      // Parse markdown sections (## or ###) into slides
      const sections = content.split(/^##\s+/m);
      for (let i = 1; i < sections.length && i <= 10; i++) {
        const secLines = sections[i].split('\n');
        const slideTitle = secLines[0].trim();
        const slideBodyLines = secLines
          .slice(1)
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !l.startsWith('|'));

        const slide = pres.addSlide();
        slide.background = { color: '0F172A' };
        slide.addText(slideTitle, {
          x: 0.8,
          y: 0.7,
          w: 8.5,
          h: 0.8,
          fontSize: 26,
          color: '38BDF8',
          bold: true,
          fontFace: 'Arial',
        });

        const bullets = slideBodyLines.slice(0, 6).map((l) => ({
          text: `${l.replace(/^[-*]\s*/, '')}\n`,
          options: { bullet: true, color: 'E2E8F0', fontSize: 16 },
        }));

        if (bullets.length > 0) {
          slide.addText(bullets, {
            x: 0.8,
            y: 1.8,
            w: 8.5,
            h: 4.0,
          });
        }
      }
    }

    const buffer = await pres.write({ outputType: 'nodebuffer' });
    fs.writeFileSync(outputFilePath, buffer);
  } else if (format === 'pdf') {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 50;
    const usableWidth = pageWidth - margin * 2;

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // Header Banner
    currentPage.drawText('3 ATHLAS INTELLIGENCE', {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.6, 0.9),
    });
    y -= 25;

    currentPage.drawText(title, {
      x: margin,
      y,
      size: 20,
      font: fontBold,
      color: rgb(0.05, 0.05, 0.1),
    });
    y -= 18;

    currentPage.drawText(`Creato da Benoit Valendino • Data: ${new Date().toLocaleDateString('it-IT')}`, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.45),
    });
    y -= 30;

    // Simple text wrapping helper
    const rawLines = content.split('\n');
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) {
        y -= 12;
        continue;
      }

      if (y < margin + 40) {
        // Add new page
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      const isHeading = line.startsWith('#');
      const cleanLine = line.replace(/^#+\s*/, '');
      const fontSize = isHeading ? 13 : 10;
      const currentFont = isHeading ? fontBold : font;
      const textColor = isHeading ? rgb(0.05, 0.2, 0.4) : rgb(0.15, 0.15, 0.15);

      // Wrap line into chunks of ~80 chars
      const words = cleanLine.split(' ');
      let currentChunk = '';

      for (const word of words) {
        const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
        const textWidth = currentFont.widthOfTextAtSize(testChunk, fontSize);
        if (textWidth > usableWidth && currentChunk) {
          currentPage.drawText(currentChunk, {
            x: margin,
            y,
            size: fontSize,
            font: currentFont,
            color: textColor,
          });
          y -= fontSize + 5;
          currentChunk = word;

          if (y < margin + 40) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
        } else {
          currentChunk = testChunk;
        }
      }

      if (currentChunk) {
        currentPage.drawText(currentChunk, {
          x: margin,
          y,
          size: fontSize,
          font: currentFont,
          color: textColor,
        });
        y -= fontSize + 6;
      }
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputFilePath, Buffer.from(pdfBytes));
  } else if (format === 'csv' || format === 'txt' || format === 'json' || format === 'md') {
    fs.writeFileSync(outputFilePath, content, 'utf-8');
  }

  const stat = fs.statSync(outputFilePath);

  const fileRecord: GeneratedFile = {
    id: fileId,
    originalName: cleanFilename,
    format,
    size: stat.size,
    downloadUrl: `/api/files/download/${fileId}`,
    description: description || `Documento ${format.toUpperCase()} generato con successo da 3 athlas.`,
    generatedBy: '3 athlas',
    createdAt: new Date().toISOString(),
  };

  return { fileRecord, filePath: outputFilePath };
}

export function findGeneratedFileById(id: string): { file: GeneratedFile; path: string } | null {
  if (!fs.existsSync(GENERATED_DIR)) return null;
  const files = fs.readdirSync(GENERATED_DIR);
  const matched = files.find((f) => f.startsWith(`${id}_`));
  if (!matched) return null;

  const fullPath = path.join(GENERATED_DIR, matched);
  const stat = fs.statSync(fullPath);
  const cleanName = matched.replace(`${id}_`, '');
  const ext = path.extname(cleanName).toLowerCase().replace('.', '') as GeneratedFileFormat;

  return {
    path: fullPath,
    file: {
      id,
      originalName: cleanName,
      format: ext,
      size: stat.size,
      downloadUrl: `/api/files/download/${id}`,
      generatedBy: '3 athlas',
      createdAt: stat.birthtime.toISOString(),
    },
  };
}
