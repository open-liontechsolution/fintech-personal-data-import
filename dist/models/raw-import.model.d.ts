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
    bankName: string;
    bankCode?: string;
    accountInfo?: {
        accountNumber?: string;
        accountHolder?: string;
        iban?: string;
    };
    rowNumber: number;
    rawData: Record<string, any>;
    headers: string[];
    importedAt: Date;
    metadata?: {
        source?: string;
        sheetName?: string;
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
    bankName: string;
    bankCode?: string;
    accountInfo?: {
        accountNumber?: string;
        accountHolder?: string;
        iban?: string;
    };
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
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
        delimiter?: string;
        sheets?: string[];
        encoding?: string;
        [key: string]: any;
    };
}
/**
 * Colección donde se almacenan los datos crudos
 */
export declare const RAW_IMPORTS_COLLECTION = "raw_imports";
/**
 * Colección donde se almacenan los resúmenes de importación
 */
export declare const IMPORT_SUMMARIES_COLLECTION = "import_summaries";
