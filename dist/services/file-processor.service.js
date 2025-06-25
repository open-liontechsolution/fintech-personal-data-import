"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb_1 = require("mongodb");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const node_1 = __importDefault(require("read-excel-file/node"));
const uuid_1 = require("uuid");
const fintech_personal_common_1 = require("fintech-personal-common");
const mongodb_service_1 = __importDefault(require("./mongodb.service"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = __importDefault(require("../config/config"));
const raw_import_model_1 = require("../models/raw-import.model");
/**
 * Servicio para procesar archivos desde GridFS e importar datos crudos a MongoDB
 */
class FileProcessorService {
    constructor() {
        this.BATCH_SIZE = 100;
        this.tempDir = config_1.default.app.tempDir;
        // Crear directorio temporal si no existe
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    /**
     * Procesa un archivo desde GridFS
     */
    async processFile(event) {
        var _a;
        const { fileId, fileName, fileType, userId, importOptions } = event.data;
        const importId = (0, uuid_1.v4)();
        const tempFilePath = path.join(this.tempDir, `${importId}_${fileName}`);
        logger_1.default.info({
            importId,
            fileId,
            fileName,
            fileType,
            userId
        }, 'Iniciando procesamiento de archivo');
        // Crear resumen inicial
        const summary = {
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
            logger_1.default.info({ fileId, tempFilePath }, 'Descargando archivo desde GridFS');
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
            let result;
            if (fileName.toLowerCase().endsWith('.csv')) {
                result = await this.processCSV(tempFilePath, summary, importOptions);
            }
            else if (fileName.toLowerCase().match(/\.(xlsx?|xls)$/)) {
                result = await this.processExcel(tempFilePath, summary, importOptions);
            }
            else {
                throw new fintech_personal_common_1.AppError('Tipo de archivo no soportado', 400);
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
            logger_1.default.info({
                importId,
                totalRows: result.totalRows,
                importedRows: result.importedRows,
                failedRows: result.failedRows
            }, 'Procesamiento de archivo completado');
            return result;
        }
        catch (error) {
            // Limpiar archivo temporal si existe
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            // Actualizar resumen con error
            summary.status = 'failed';
            summary.completedAt = new Date();
            (_a = summary.errors) === null || _a === void 0 ? void 0 : _a.push({
                rowNumber: 0,
                error: error instanceof Error ? error.message : 'Error desconocido'
            });
            await this.saveSummary(summary);
            logger_1.default.error({
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
    async processCSV(filePath, summary, importOptions) {
        return new Promise((resolve, reject) => {
            const results = [];
            let rowNumber = 0;
            let headers = [];
            const skipRows = (importOptions === null || importOptions === void 0 ? void 0 : importOptions.skipRows) || 0;
            const hasHeaders = (importOptions === null || importOptions === void 0 ? void 0 : importOptions.hasHeaders) !== false; // Por defecto asume que hay headers
            const stream = fs.createReadStream(filePath)
                .pipe((0, csv_parser_1.default)({
                headers: false, // Manejamos headers manualmente
                separator: (importOptions === null || importOptions === void 0 ? void 0 : importOptions.delimiter) || ','
            }))
                .on('data', async (row) => {
                var _a, _b;
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
                        const rawData = {};
                        // Mapear datos con headers o usar índices
                        if (headers.length > 0) {
                            headers.forEach((header, index) => {
                                rawData[header] = row[index] || '';
                            });
                        }
                        else {
                            row.forEach((value, index) => {
                                rawData[`column_${index + 1}`] = value || '';
                            });
                        }
                        const rawImportData = {
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
                            }
                            catch (error) {
                                summary.failedRows += results.length;
                                (_a = summary.errors) === null || _a === void 0 ? void 0 : _a.push({
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
                }
                catch (error) {
                    summary.failedRows++;
                    (_b = summary.errors) === null || _b === void 0 ? void 0 : _b.push({
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
                }
                catch (error) {
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
    async processExcel(filePath, summary, importOptions) {
        var _a, _b;
        try {
            const sheetName = importOptions === null || importOptions === void 0 ? void 0 : importOptions.sheetName;
            const skipRows = (importOptions === null || importOptions === void 0 ? void 0 : importOptions.skipRows) || 0;
            const hasHeaders = (importOptions === null || importOptions === void 0 ? void 0 : importOptions.hasHeaders) !== false;
            // Leer archivo Excel
            const rows = await (0, node_1.default)(filePath);
            if (!rows || rows.length === 0) {
                throw new Error('El archivo Excel está vacío');
            }
            // Actualizar metadata con información básica
            if (summary.metadata) {
                summary.metadata.sheets = ['Sheet1']; // Por defecto, solo procesamos la primera hoja
            }
            const results = [];
            let headers = [];
            for (let i = 0; i < rows.length; i++) {
                // Saltar filas según configuración
                if (i < skipRows) {
                    continue;
                }
                const row = rows[i];
                // Primera fila después de skip podría ser headers
                if (hasHeaders && i === skipRows) {
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
                        const rawData = {};
                        row.forEach((cell, index) => {
                            const key = headers.length > index ? headers[index] : `column_${index + 1}`;
                            rawData[key] = cell;
                        });
                        const rawImportData = {
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
                            }
                            catch (error) {
                                summary.failedRows += results.length;
                                (_a = summary.errors) === null || _a === void 0 ? void 0 : _a.push({
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
                }
                catch (error) {
                    summary.failedRows++;
                    (_b = summary.errors) === null || _b === void 0 ? void 0 : _b.push({
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
        }
        catch (error) {
            logger_1.default.error({ error, filePath }, 'Error al procesar archivo Excel');
            throw error;
        }
    }
    /**
     * Guarda datos crudos en MongoDB
     */
    async saveRawImports(data) {
        const db = mongodb_service_1.default.getDB();
        const collection = db.collection(raw_import_model_1.RAW_IMPORTS_COLLECTION);
        try {
            await collection.insertMany(data);
            logger_1.default.debug({ count: data.length }, 'Datos crudos guardados en MongoDB');
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error al guardar datos crudos');
            throw error;
        }
    }
    /**
     * Guarda o actualiza el resumen de importación
     */
    async saveSummary(summary) {
        const db = mongodb_service_1.default.getDB();
        const collection = db.collection(raw_import_model_1.IMPORT_SUMMARIES_COLLECTION);
        try {
            await collection.replaceOne({ importId: summary.importId }, summary, { upsert: true });
            logger_1.default.debug({ importId: summary.importId }, 'Resumen de importación actualizado');
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error al guardar resumen de importación');
            throw error;
        }
    }
    /**
     * Descarga un archivo desde la colección uploaded_files (alternativa a GridFS)
     */
    async downloadFileFromGridFS(fileId, destinationPath) {
        const db = mongodb_service_1.default.getDB();
        const filesCollection = db.collection('uploaded_files');
        try {
            // Buscar el archivo por ObjectId
            const file = await filesCollection.findOne({ _id: new mongodb_1.ObjectId(fileId) });
            if (!file) {
                throw new fintech_personal_common_1.AppError(`Archivo no encontrado: ${fileId}`, 404);
            }
            if (!file.data) {
                throw new fintech_personal_common_1.AppError(`Archivo sin datos: ${fileId}`, 400);
            }
            // Convertir de base64 a buffer
            const fileBuffer = Buffer.from(file.data, 'base64');
            // Escribir archivo al destino
            fs.writeFileSync(destinationPath, fileBuffer);
            logger_1.default.info(`Archivo descargado: ${file.filename} (${fileBuffer.length} bytes) -> ${destinationPath}`);
        }
        catch (error) {
            if (error instanceof fintech_personal_common_1.AppError) {
                throw error;
            }
            throw new fintech_personal_common_1.AppError(`Error al descargar archivo: ${error instanceof Error ? error.message : String(error)}`, 500);
        }
    }
    /**
     * Obtiene el tipo MIME basado en la extensión del archivo
     */
    getMimeType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
            '.csv': 'text/csv',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
    /**
     * Detecta el banco basado en el nombre del archivo
     */
    async detectBankFromFileName(fileName) {
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
    async detectBankFromContent(headers) {
        const headerStr = headers.join('|').toLowerCase();
        // Detectar ING basándose en headers típicos de sus exportaciones
        if (headerStr.includes('fecha') &&
            headerStr.includes('nombre') &&
            (headerStr.includes('cuenta') || headerStr.includes('contrapartida')) &&
            (headerStr.includes('importe') || headerStr.includes('cantidad'))) {
            // Buscar número de cuenta en headers
            let accountInfo;
            const accountHeader = headers.find(h => h.toLowerCase().includes('cuenta') ||
                h.toLowerCase().includes('iban') ||
                h.toLowerCase().includes('número'));
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
        if (headerStr.includes('fecha operacion') &&
            headerStr.includes('importe') &&
            (headerStr.includes('concepto') || headerStr.includes('descripcion'))) {
            return {
                bankName: 'BBVA',
                bankCode: 'BBVA',
                confidence: 0.9
            };
        }
        // Detectar Santander
        if (headerStr.includes('fecha valor') &&
            headerStr.includes('movimiento') &&
            headerStr.includes('saldo')) {
            return {
                bankName: 'Santander',
                bankCode: 'SANT',
                confidence: 0.9
            };
        }
        // Detectar CaixaBank
        if (headerStr.includes('data') &&
            headerStr.includes('concepte') &&
            headerStr.includes('import')) {
            return {
                bankName: 'CaixaBank',
                bankCode: 'CAIX',
                confidence: 0.9
            };
        }
        // Detectar patrones genéricos de bancos
        if (headerStr.includes('fecha') &&
            headerStr.includes('importe') &&
            (headerStr.includes('concepto') || headerStr.includes('descripcion') || headerStr.includes('detalle'))) {
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
    async saveRawDataBatch(data) {
        const db = mongodb_service_1.default.getDB();
        const collection = db.collection(raw_import_model_1.RAW_IMPORTS_COLLECTION);
        try {
            await collection.insertMany(data);
            logger_1.default.debug({ count: data.length }, 'Datos crudos guardados en MongoDB');
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error al guardar datos crudos');
            throw error;
        }
    }
}
exports.default = FileProcessorService;
//# sourceMappingURL=file-processor.service.js.map