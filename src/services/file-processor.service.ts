import { GridFSBucket, ObjectId, Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import { AppError, FileUploadedEvent, FileImportStatusUpdateEvent } from 'fintech-personal-common';
import MongoDBService from './mongodb.service';
import logger from '../utils/logger';
import config from '../config/config';
import { RawImportData, ImportSummary, RAW_IMPORTS_COLLECTION, IMPORT_SUMMARIES_COLLECTION } from '../models/raw-import.model';

/**
 * Servicio para procesar archivos desde GridFS e importar datos crudos a MongoDB
 */
class FileProcessorService {
  private tempDir: string;
  private BATCH_SIZE = 100;

  constructor() {
    this.tempDir = config.app.tempDir;
    // Crear directorio temporal si no existe
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Procesa un archivo desde GridFS
   */
  async processFile(event: FileUploadedEvent): Promise<ImportSummary> {
    const { fileId, fileName, fileType, userId, importOptions } = event.data;
    const importId = uuidv4();
    const tempFilePath = path.join(this.tempDir, `${importId}_${fileName}`);

    logger.info({
      importId,
      fileId,
      fileName,
      fileType,
      userId
    }, 'Iniciando procesamiento de archivo');

    // Crear resumen inicial
    const summary: ImportSummary = {
      importId,
      fileId,
      fileName,
      fileType,
      userId,
      bankName: 'Unknown', // Se actualizará después del análisis
      status: 'processing',
      progress: 0,
      totalRows: 0,
      importedRows: 0,
      failedRows: 0,
      headers: [],
      startedAt: new Date(),
      errors: [],
      metadata: {
        fileSize: 0,
        mimeType: 'application/vnd.ms-excel'
      }
    };

    try {
      // Guardar resumen inicial en MongoDB
      await this.saveSummary(summary);

      // Descargar archivo desde GridFS
      logger.info({ fileId, tempFilePath }, 'Descargando archivo desde GridFS');
      await this.downloadFileFromGridFS(fileId, tempFilePath);

      // Obtener información del archivo
      const fileStats = fs.statSync(tempFilePath);
      summary.metadata = {
        fileSize: fileStats.size,
        mimeType: this.getMimeType(fileName)
      };

      // Detectar banco basado en el nombre del archivo
      const bankDetection = await this.detectBankFromFileName(fileName);
      summary.bankName = bankDetection.bankName;
      summary.bankCode = bankDetection.bankCode;

      // Procesar según el tipo de archivo
      let result: ImportSummary;
      if (fileName.toLowerCase().endsWith('.csv')) {
        result = await this.processCSV(tempFilePath, summary, importOptions);
      } else if (fileName.toLowerCase().match(/\.(xlsx?|xls)$/)) {
        result = await this.processExcel(tempFilePath, summary, importOptions);
      } else {
        throw new AppError('Tipo de archivo no soportado', 400);
      }

      // Limpiar archivo temporal
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      // Actualizar resumen final
      result.status = 'completed';
      result.completedAt = new Date();
      result.progress = 100;
      await this.saveSummary(result);

      logger.info({
        importId,
        totalRows: result.totalRows,
        importedRows: result.importedRows,
        failedRows: result.failedRows
      }, 'Procesamiento de archivo completado');

      return result;
    } catch (error) {
      // Limpiar archivo temporal si existe
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      // Actualizar resumen con error
      summary.status = 'failed';
      summary.completedAt = new Date();
      summary.errors?.push({
        rowNumber: 0,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
      await this.saveSummary(summary);

      logger.error({
        error,
        importId,
        fileId,
      }, 'Error al procesar archivo');

      throw error;
    }
  }

  /**
   * Procesa un archivo CSV
   */
  private async processCSV(
    filePath: string,
    summary: ImportSummary,
    importOptions?: any
  ): Promise<ImportSummary> {
    return new Promise((resolve, reject) => {
      const results: RawImportData[] = [];
      let rowNumber = 0;
      let headers: string[] = [];
      const skipRows = importOptions?.skipRows || 0;
      const hasHeaders = importOptions?.hasHeaders !== false; // Por defecto asume que hay headers

      const stream = fs.createReadStream(filePath)
        .pipe(csvParser({
          headers: false, // Manejamos headers manualmente
          separator: importOptions?.delimiter || ','
        }))
        .on('data', async (row: string[]) => {
          try {
            rowNumber++;

            // Saltar filas si se especifica
            if (rowNumber <= skipRows) {
              return;
            }

            // Procesar headers
            if (hasHeaders && headers.length === 0) {
              headers = row.filter(h => h && h.trim() !== '');
              summary.headers = headers;
              
              // Detectar banco basado en headers
              const bankDetection = await this.detectBankFromContent(headers);
              if (bankDetection.bankName && bankDetection.confidence && bankDetection.confidence > 0.8) {
                summary.bankName = bankDetection.bankName;
                summary.bankCode = bankDetection.bankCode;
                summary.accountInfo = bankDetection.accountInfo;
              }
              
              summary.totalRows = 0; // Los headers no cuentan como datos
              return;
            }

            // Procesar datos
            if (row.some(cell => cell && cell.trim() !== '')) {
              const rawData: Record<string, any> = {};
              
              // Mapear datos con headers o usar índices
              if (headers.length > 0) {
                headers.forEach((header, index) => {
                  rawData[header] = row[index] || '';
                });
              } else {
                row.forEach((value, index) => {
                  rawData[`column_${index + 1}`] = value || '';
                });
              }

              const rawImportData: RawImportData = {
                importId: summary.importId,
                fileId: summary.fileId,
                fileName: summary.fileName,
                fileType: summary.fileType,
                userId: summary.userId,
                bankName: summary.bankName,
                bankCode: summary.bankCode,
                accountInfo: summary.accountInfo,
                rowNumber: summary.totalRows + 1,
                rawData,
                headers: headers.length > 0 ? headers : Object.keys(rawData),
                importedAt: new Date()
              };

              results.push(rawImportData);
              summary.totalRows++;

              // Guardar en lotes
              if (results.length >= this.BATCH_SIZE) {
                try {
                  await this.saveRawDataBatch(results);
                  summary.importedRows += results.length;
                  results.length = 0; // Limpiar array
                } catch (error) {
                  summary.failedRows += results.length;
                  summary.errors?.push({
                    rowNumber: summary.totalRows,
                    error: error instanceof Error ? error.message : 'Error al guardar lote'
                  });
                  results.length = 0;
                }

                // Actualizar progreso
                summary.progress = Math.round((summary.importedRows / summary.totalRows) * 100);
                await this.saveSummary(summary);
              }
            }
          } catch (error) {
            summary.failedRows++;
            summary.errors?.push({
              rowNumber,
              error: error instanceof Error ? error.message : 'Error al procesar fila'
            });
          }
        })
        .on('end', async () => {
          try {
            // Guardar registros restantes
            if (results.length > 0) {
              await this.saveRawDataBatch(results);
              summary.importedRows += results.length;
            }

            summary.status = 'completed';
            summary.progress = 100;
            summary.completedAt = new Date();
            await this.saveSummary(summary);

            resolve(summary);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Procesa un archivo Excel
   */
  private async processExcel(
    filePath: string,
    summary: ImportSummary,
    importOptions?: any
  ): Promise<ImportSummary> {
    try {
      // Leer archivo Excel
      const workbook = XLSX.readFile(filePath);
      
      // Usar el nombre de hoja especificado o la primera hoja disponible
      const availableSheets = workbook.SheetNames;
      const targetSheetName = importOptions?.sheetName || availableSheets[0];
      const sheet = workbook.Sheets[targetSheetName];
      
      if (!sheet) {
        throw new Error(`Hoja "${targetSheetName}" no encontrada. Hojas disponibles: ${availableSheets.join(', ')}`);
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      if (!rows || rows.length === 0) {
        throw new Error('El archivo Excel está vacío');
      }
      
      // Actualizar metadata con información básica
      if (summary.metadata) {
        summary.metadata.sheets = [targetSheetName]; // Por defecto, solo procesamos la primera hoja
      }

      const results: RawImportData[] = [];
      let headers: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        // Saltar filas según configuración
        if (i < (importOptions?.skipRows || 0)) {
          continue;
        }

        const row = rows[i];

        // Primera fila después de skip podría ser headers
        if ((importOptions?.hasHeaders !== false) && i === (importOptions?.skipRows || 0)) {
          headers = row.map(cell => String(cell || '')).filter(h => h.trim() !== '');
          summary.headers = headers;
          
          // Detectar banco basado en headers
          const bankDetection = await this.detectBankFromContent(headers);
          if (bankDetection.bankName && bankDetection.confidence > 0.8) {
            summary.bankName = bankDetection.bankName;
            summary.bankCode = bankDetection.bankCode;
            summary.accountInfo = bankDetection.accountInfo;
          }
          
          continue;
        }

        try {
          // Verificar si la fila tiene datos
          if (row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
            // Crear objeto de datos crudos
            const rawData: Record<string, any> = {};

            row.forEach((cell, index) => {
              const key = headers.length > index ? headers[index] : `column_${index + 1}`;
              rawData[key] = cell;
            });

            const rawImportData: RawImportData = {
              importId: summary.importId,
              fileId: summary.fileId,
              fileName: summary.fileName,
              fileType: summary.fileType,
              userId: summary.userId,
              bankName: summary.bankName,
              bankCode: summary.bankCode,
              accountInfo: summary.accountInfo,
              rowNumber: summary.totalRows + 1,
              rawData,
              headers: headers.length > 0 ? headers : Object.keys(rawData),
              importedAt: new Date()
            };

            results.push(rawImportData);
            summary.totalRows++;

            // Guardar en lotes
            if (results.length >= this.BATCH_SIZE) {
              try {
                await this.saveRawDataBatch(results);
                summary.importedRows += results.length;
                results.length = 0; // Limpiar array
              } catch (error) {
                summary.failedRows += results.length;
                summary.errors?.push({
                  rowNumber: summary.totalRows,
                  error: error instanceof Error ? error.message : 'Error al guardar lote'
                });
                results.length = 0;
              }

              // Actualizar progreso
              summary.progress = Math.round((summary.importedRows / summary.totalRows) * 100);
              await this.saveSummary(summary);
            }
          }
        } catch (error) {
          summary.failedRows++;
          summary.errors?.push({
            rowNumber: summary.totalRows + 1,
            error: error instanceof Error ? error.message : 'Error al procesar fila'
          });
        }
      }

      // Guardar registros restantes
      if (results.length > 0) {
        await this.saveRawDataBatch(results);
        summary.importedRows += results.length;
      }

      summary.status = 'completed';
      summary.progress = 100;
      summary.completedAt = new Date();
      await this.saveSummary(summary);

      return summary;

    } catch (error) {
      logger.error({ error, filePath }, 'Error al procesar archivo Excel');
      throw error;
    }
  }

  /**
   * Guarda datos crudos en MongoDB
   */
  private async saveRawImports(data: RawImportData[]): Promise<void> {
    const db = MongoDBService.getDB();
    const collection = db.collection<RawImportData>(RAW_IMPORTS_COLLECTION);
    
    try {
      await collection.insertMany(data);
      logger.debug({ count: data.length }, 'Datos crudos guardados en MongoDB');
    } catch (error) {
      logger.error({ error }, 'Error al guardar datos crudos');
      throw error;
    }
  }

  /**
   * Guarda o actualiza el resumen de importación
   */
  private async saveSummary(summary: ImportSummary): Promise<void> {
    const db = MongoDBService.getDB();
    const collection = db.collection<ImportSummary>(IMPORT_SUMMARIES_COLLECTION);
    
    try {
      await collection.replaceOne(
        { importId: summary.importId },
        summary,
        { upsert: true }
      );
      logger.debug({ importId: summary.importId }, 'Resumen de importación actualizado');
    } catch (error) {
      logger.error({ error }, 'Error al guardar resumen de importación');
      throw error;
    }
  }

  /**
   * Descarga un archivo desde la colección uploaded_files (alternativa a GridFS)
   */
  private async downloadFileFromGridFS(fileId: string, destinationPath: string): Promise<void> {
    const db = MongoDBService.getDB();
    const filesCollection = db.collection('uploaded_files');
    
    try {
      // Buscar el archivo por ObjectId
      const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });
      
      if (!file) {
        throw new AppError(`Archivo no encontrado: ${fileId}`, 404);
      }
      
      if (!file.data) {
        throw new AppError(`Archivo sin datos: ${fileId}`, 400);
      }
      
      // Convertir de base64 a buffer
      const fileBuffer = Buffer.from(file.data, 'base64');
      
      // Escribir archivo al destino
      fs.writeFileSync(destinationPath, fileBuffer);
      
      logger.info(`Archivo descargado: ${file.filename} (${fileBuffer.length} bytes) -> ${destinationPath}`);
      
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(`Error al descargar archivo: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
  }

  /**
   * Obtiene el tipo MIME basado en la extensión del archivo
   */
  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Detecta el banco basado en el nombre del archivo
   */
  private async detectBankFromFileName(fileName: string): Promise<{ bankName: string; bankCode?: string }> {
    const lowerFileName = fileName.toLowerCase();
    
    // Detectar ING
    if (lowerFileName.includes('ing') || lowerFileName.includes('movements')) {
      return {
        bankName: 'ING',
        bankCode: 'ING'
      };
    }
    
    // Detectar BBVA
    if (lowerFileName.includes('bbva')) {
      return {
        bankName: 'BBVA',
        bankCode: 'BBVA'
      };
    }
    
    // Detectar Santander
    if (lowerFileName.includes('santander') || lowerFileName.includes('san')) {
      return {
        bankName: 'Santander',
        bankCode: 'SANT'
      };
    }
    
    // Detectar CaixaBank
    if (lowerFileName.includes('caixa') || lowerFileName.includes('lacaixa')) {
      return {
        bankName: 'CaixaBank',
        bankCode: 'CAIX'
      };
    }
    
    // Banco desconocido
    return {
      bankName: 'Unknown'
    };
  }

  private async detectBankFromContent(headers: string[]): Promise<{ bankName: string; bankCode?: string; accountInfo?: any; confidence: number }> {
    const headerStr = headers.join('|').toLowerCase();
    
    // Detectar ING basándose en headers típicos de sus exportaciones
    if (
      headerStr.includes('fecha') && 
      headerStr.includes('nombre') && 
      (headerStr.includes('cuenta') || headerStr.includes('contrapartida')) &&
      (headerStr.includes('importe') || headerStr.includes('cantidad'))
    ) {
      // Buscar número de cuenta en headers
      let accountInfo;
      const accountHeader = headers.find(h => 
        h.toLowerCase().includes('cuenta') || 
        h.toLowerCase().includes('iban') ||
        h.toLowerCase().includes('número')
      );
      
      if (accountHeader) {
        accountInfo = { accountType: accountHeader };
      }
      
      return {
        bankName: 'ING',
        bankCode: 'ING',
        confidence: 0.95,
        accountInfo
      };
    }
    
    // Detectar BBVA basándose en headers típicos
    if (
      headerStr.includes('fecha operacion') && 
      headerStr.includes('importe') &&
      (headerStr.includes('concepto') || headerStr.includes('descripcion'))
    ) {
      return {
        bankName: 'BBVA',
        bankCode: 'BBVA',
        confidence: 0.9
      };
    }
    
    // Detectar Santander
    if (
      headerStr.includes('fecha valor') && 
      headerStr.includes('movimiento') &&
      headerStr.includes('saldo')
    ) {
      return {
        bankName: 'Santander',
        bankCode: 'SANT',
        confidence: 0.9
      };
    }
    
    // Detectar CaixaBank
    if (
      headerStr.includes('data') && 
      headerStr.includes('concepte') &&
      headerStr.includes('import')
    ) {
      return {
        bankName: 'CaixaBank',
        bankCode: 'CAIX',
        confidence: 0.9
      };
    }
    
    // Detectar patrones genéricos de bancos
    if (
      headerStr.includes('fecha') && 
      headerStr.includes('importe') &&
      (headerStr.includes('concepto') || headerStr.includes('descripcion') || headerStr.includes('detalle'))
    ) {
      return {
        bankName: 'Generic Bank',
        confidence: 0.7
      };
    }
    
    // No se pudo detectar el banco
    return {
      bankName: 'Unknown',
      confidence: 0.1
    };
  }

  private async saveRawDataBatch(data: RawImportData[]): Promise<void> {
    const db = MongoDBService.getDB();
    const collection = db.collection<RawImportData>(RAW_IMPORTS_COLLECTION);
    
    try {
      await collection.insertMany(data);
      logger.debug({ count: data.length }, 'Datos crudos guardados en MongoDB');
    } catch (error) {
      logger.error({ error }, 'Error al guardar datos crudos');
      throw error;
    }
  }
}

export default FileProcessorService;
