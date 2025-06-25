import { ObjectId } from 'mongodb';

/**
 * Modelo para almacenar datos crudos importados desde archivos financieros
 * Este modelo almacena los datos tal como vienen del archivo sin procesamiento
 */
export interface RawImportData {
  _id?: string;
  importId: string;
  fileId: string;
  fileName: string;
  fileType: string;
  userId: string;
  bankName: string; // Nombre del banco (ej: "ING", "BBVA", "Santander")
  bankCode?: string; // Código del banco si se conoce
  accountInfo?: {
    accountNumber?: string;
    accountHolder?: string;
    iban?: string;
  };
  rowNumber: number;
  rawData: Record<string, any>; // Datos tal como vienen del archivo
  headers: string[];
  importedAt: Date;
  metadata?: {
    source?: string;
    sheetName?: string; // Para archivos Excel
  };
}

/**
 * Modelo para el resumen de la importación
 */
export interface ImportSummary {
  _id?: string;
  importId: string;
  fileId: string;
  fileName: string;
  fileType: string;
  userId: string;
  bankName: string; // Nombre del banco
  bankCode?: string; // Código del banco si se conoce
  accountInfo?: {
    accountNumber?: string;
    accountHolder?: string;
    iban?: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  totalRows: number;
  importedRows: number;
  failedRows: number;
  headers: string[];
  startedAt: Date;
  completedAt?: Date;
  errors: Array<{
    rowNumber?: number;
    error?: string;
    message?: string;
  }>;
  metadata: {
    fileSize: number;
    mimeType: string;
    delimiter?: string; // Para CSV
    sheets?: string[]; // Para Excel
    encoding?: string;
    [key: string]: any;
  };
}

/**
 * Colección donde se almacenan los datos crudos
 */
export const RAW_IMPORTS_COLLECTION = 'raw_imports';

/**
 * Colección donde se almacenan los resúmenes de importación
 */
export const IMPORT_SUMMARIES_COLLECTION = 'import_summaries';
