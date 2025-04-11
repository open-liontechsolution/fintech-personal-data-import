/**
 * Resultado del procesamiento de un archivo
 */
interface ProcessingResult {
    recordsProcessed: number;
    recordsImported: number;
    recordsRejected: number;
    errors?: Array<{
        rowNumber?: number;
        message: string;
    }>;
}
/**
 * Opciones de importación
 */
interface ImportOptions {
    hasHeaders?: boolean;
    delimiter?: string;
    sheet?: string | number;
    mapping?: Record<string, string>;
    skipRows?: number;
}
/**
 * Servicio para procesar archivos desde GridFS
 */
declare class FileProcessorService {
    private tempDir;
    constructor();
    /**
     * Procesa un archivo desde GridFS
     * @param fileId ID del archivo en GridFS
     * @param fileName Nombre original del archivo
     * @param fileType Tipo MIME del archivo
     * @param userId ID del usuario que subió el archivo
     * @param importId ID único para esta importación
     * @param options Opciones de importación
     * @returns Resultado del procesamiento
     */
    processFile(fileId: string, fileName: string, fileType: string, userId: string, importId: string, options?: ImportOptions): Promise<ProcessingResult>;
    /**
     * Descarga un archivo desde GridFS
     * @param fileId ID del archivo en GridFS
     * @param destinationPath Ruta donde guardar el archivo
     */
    private downloadFileFromGridFS;
    /**
     * Elimina un archivo de GridFS
     * @param fileId ID del archivo en GridFS
     */
    private deleteFileFromGridFS;
    /**
     * Procesa un archivo CSV
     * @param filePath Ruta al archivo CSV
     * @param userId ID del usuario
     * @param importId ID de la importación
     * @param options Opciones de importación
     * @returns Resultado del procesamiento
     */
    private processCSV;
    /**
     * Procesa un archivo Excel
     * @param filePath Ruta al archivo Excel
     * @param userId ID del usuario
     * @param importId ID de la importación
     * @param options Opciones de importación
     * @returns Resultado del procesamiento
     */
    private processExcel;
}
export default FileProcessorService;
