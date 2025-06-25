import { FileUploadedEvent } from 'fintech-personal-common';
import { ImportSummary } from '../models/raw-import.model';
/**
 * Servicio para procesar archivos desde GridFS e importar datos crudos a MongoDB
 */
declare class FileProcessorService {
    private tempDir;
    private BATCH_SIZE;
    constructor();
    /**
     * Procesa un archivo desde GridFS
     */
    processFile(event: FileUploadedEvent): Promise<ImportSummary>;
    /**
     * Procesa un archivo CSV
     */
    private processCSV;
    /**
     * Procesa un archivo Excel
     */
    private processExcel;
    /**
     * Guarda datos crudos en MongoDB
     */
    private saveRawImports;
    /**
     * Guarda o actualiza el resumen de importación
     */
    private saveSummary;
    /**
     * Descarga un archivo desde la colección uploaded_files (alternativa a GridFS)
     */
    private downloadFileFromGridFS;
    /**
     * Obtiene el tipo MIME basado en la extensión del archivo
     */
    private getMimeType;
    /**
     * Detecta el banco basado en el nombre del archivo
     */
    private detectBankFromFileName;
    private detectBankFromContent;
    private saveRawDataBatch;
}
export default FileProcessorService;
