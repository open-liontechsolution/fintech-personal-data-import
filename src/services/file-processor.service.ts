import { GridFSBucket, ObjectId } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import readXlsxFile from 'read-excel-file/node';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from 'fintech-personal-common';
import MongoDBService from './mongodb.service';
import logger from '../utils/logger';
import config from '../config/config';

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
class FileProcessorService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    // Crear directorio temporal si no existe
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

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
  async processFile(
    fileId: string, 
    fileName: string, 
    fileType: string, 
    userId: string, 
    importId: string,
    options?: ImportOptions
  ): Promise<ProcessingResult> {
    const tempFilePath = path.join(this.tempDir, `${importId}_${path.basename(fileName)}`);
    
    try {
      // Descargar archivo de GridFS
      await this.downloadFileFromGridFS(fileId, tempFilePath);
      
      logger.info({
        importId,
        fileId,
        tempFilePath,
      }, 'Archivo descargado de GridFS');
      
      // Procesar según el tipo de archivo
      let result: ProcessingResult;
      
      if (fileType.includes('csv') || fileName.endsWith('.csv')) {
        result = await this.processCSV(tempFilePath, userId, importId, options);
      } else if (
        fileType.includes('excel') || 
        fileType.includes('spreadsheetml') || 
        fileName.endsWith('.xlsx') || 
        fileName.endsWith('.xls')
      ) {
        result = await this.processExcel(tempFilePath, userId, importId, options);
      } else {
        throw new AppError('Formato de archivo no soportado', 400);
      }
      
      // Eliminar archivo temporal
      fs.unlinkSync(tempFilePath);
      
      // Eliminar archivo de GridFS si está configurado
      if (config.processing.deleteAfterProcessing) {
        await this.deleteFileFromGridFS(fileId);
        logger.info({ fileId }, 'Archivo eliminado de GridFS');
      }
      
      return result;
    } catch (error) {
      // Limpiar archivo temporal si existe
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      
      logger.error({
        error,
        importId,
        fileId,
      }, 'Error al procesar archivo');
      
      throw error;
    }
  }

  /**
   * Descarga un archivo desde GridFS
   * @param fileId ID del archivo en GridFS
   * @param destinationPath Ruta donde guardar el archivo
   */
  private async downloadFileFromGridFS(fileId: string, destinationPath: string): Promise<void> {
    const bucket = MongoDBService.getGridFSBucket();
    const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
    const writeStream = fs.createWriteStream(destinationPath);
    
    return new Promise<void>((resolve, reject) => {
      downloadStream
        .pipe(writeStream)
        .on('error', (error: Error) => {
          reject(new AppError(`Error al descargar archivo de GridFS: ${error.message}`, 500));
        })
        .on('finish', () => {
          resolve();
        });
    });
  }

  /**
   * Elimina un archivo de GridFS
   * @param fileId ID del archivo en GridFS
   */
  private async deleteFileFromGridFS(fileId: string): Promise<void> {
    const bucket = MongoDBService.getGridFSBucket();
    await bucket.delete(new ObjectId(fileId));
  }

  /**
   * Procesa un archivo CSV
   * @param filePath Ruta al archivo CSV
   * @param userId ID del usuario
   * @param importId ID de la importación
   * @param options Opciones de importación
   * @returns Resultado del procesamiento
   */
  private async processCSV(
    filePath: string, 
    userId: string, 
    importId: string,
    options?: ImportOptions
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      recordsProcessed: 0,
      recordsImported: 0,
      recordsRejected: 0,
      errors: [],
    };
    
    return new Promise<ProcessingResult>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csvParser({
          separator: options?.delimiter || ',',
          skipLines: options?.skipRows || 0,
          headers: options?.hasHeaders !== false,
        }))
        .on('data', (data: Record<string, any>) => {
          result.recordsProcessed++;
          
          try {
            // Aplicar mapeo si existe
            if (options?.mapping) {
              const mappedData: Record<string, any> = {};
              Object.entries(options.mapping).forEach(([target, source]) => {
                mappedData[target] = data[source];
              });
              data = mappedData;
            }
            
            // Aquí iría la lógica para guardar los datos en MongoDB
            // Por ahora solo incrementamos el contador
            result.recordsImported++;
          } catch (error) {
            result.recordsRejected++;
            result.errors?.push({
              rowNumber: result.recordsProcessed,
              message: (error as Error).message,
            });
          }
        })
        .on('error', (error: Error) => {
          reject(new AppError(`Error al procesar CSV: ${error.message}`, 500));
        })
        .on('end', () => {
          resolve(result);
        });
    });
  }

  /**
   * Procesa un archivo Excel
   * @param filePath Ruta al archivo Excel
   * @param userId ID del usuario
   * @param importId ID de la importación
   * @param options Opciones de importación
   * @returns Resultado del procesamiento
   */
  private async processExcel(
    filePath: string, 
    userId: string, 
    importId: string,
    options?: ImportOptions
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      recordsProcessed: 0,
      recordsImported: 0,
      recordsRejected: 0,
      errors: [],
    };
    
    try {
      const rows = await readXlsxFile(filePath, {
        sheet: options?.sheet || 1,
      });
      
      // Omitir filas de encabezado si es necesario
      const startRow = options?.hasHeaders !== false ? 1 : 0;
      const skipRows = options?.skipRows || 0;
      
      for (let i = startRow + skipRows; i < rows.length; i++) {
        result.recordsProcessed++;
        
        try {
          const row = rows[i];
          let data: Record<string, any> = {};
          
          // Si hay encabezados, usar la primera fila como nombres de campo
          if (options?.hasHeaders !== false) {
            const headers = rows[0];
            headers.forEach((header: any, index: number) => {
              if (header) {
                data[header.toString()] = row[index];
              }
            });
          } else {
            // Sin encabezados, usar índices como nombres de campo
            row.forEach((value: any, index: number) => {
              data[`field${index}`] = value;
            });
          }
          
          // Aplicar mapeo si existe
          if (options?.mapping) {
            const mappedData: Record<string, any> = {};
            Object.entries(options.mapping).forEach(([target, source]) => {
              mappedData[target] = data[source];
            });
            data = mappedData;
          }
          
          // Aquí iría la lógica para guardar los datos en MongoDB
          // Por ahora solo incrementamos el contador
          result.recordsImported++;
        } catch (error) {
          result.recordsRejected++;
          result.errors?.push({
            rowNumber: result.recordsProcessed + startRow,
            message: (error as Error).message,
          });
        }
      }
      
      return result;
    } catch (error) {
      throw new AppError(`Error al procesar Excel: ${(error as Error).message}`, 500);
    }
  }
}

export default FileProcessorService;
