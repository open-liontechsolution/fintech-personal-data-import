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
const fintech_personal_common_1 = require("fintech-personal-common");
const mongodb_service_1 = __importDefault(require("./mongodb.service"));
const logger_1 = __importDefault(require("../utils/logger"));
const config_1 = __importDefault(require("../config/config"));
/**
 * Servicio para procesar archivos desde GridFS
 */
class FileProcessorService {
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
    async processFile(fileId, fileName, fileType, userId, importId, options) {
        const tempFilePath = path.join(this.tempDir, `${importId}_${path.basename(fileName)}`);
        try {
            // Descargar archivo de GridFS
            await this.downloadFileFromGridFS(fileId, tempFilePath);
            logger_1.default.info({
                importId,
                fileId,
                tempFilePath,
            }, 'Archivo descargado de GridFS');
            // Procesar según el tipo de archivo
            let result;
            if (fileType.includes('csv') || fileName.endsWith('.csv')) {
                result = await this.processCSV(tempFilePath, userId, importId, options);
            }
            else if (fileType.includes('excel') ||
                fileType.includes('spreadsheetml') ||
                fileName.endsWith('.xlsx') ||
                fileName.endsWith('.xls')) {
                result = await this.processExcel(tempFilePath, userId, importId, options);
            }
            else {
                throw new fintech_personal_common_1.AppError('Formato de archivo no soportado', 400);
            }
            // Eliminar archivo temporal
            fs.unlinkSync(tempFilePath);
            // Eliminar archivo de GridFS si está configurado
            if (config_1.default.processing.deleteAfterProcessing) {
                await this.deleteFileFromGridFS(fileId);
                logger_1.default.info({ fileId }, 'Archivo eliminado de GridFS');
            }
            return result;
        }
        catch (error) {
            // Limpiar archivo temporal si existe
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            logger_1.default.error({
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
    async downloadFileFromGridFS(fileId, destinationPath) {
        const bucket = mongodb_service_1.default.getGridFSBucket();
        const downloadStream = bucket.openDownloadStream(new mongodb_1.ObjectId(fileId));
        const writeStream = fs.createWriteStream(destinationPath);
        return new Promise((resolve, reject) => {
            downloadStream
                .pipe(writeStream)
                .on('error', (error) => {
                reject(new fintech_personal_common_1.AppError(`Error al descargar archivo de GridFS: ${error.message}`, 500));
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
    async deleteFileFromGridFS(fileId) {
        const bucket = mongodb_service_1.default.getGridFSBucket();
        await bucket.delete(new mongodb_1.ObjectId(fileId));
    }
    /**
     * Procesa un archivo CSV
     * @param filePath Ruta al archivo CSV
     * @param userId ID del usuario
     * @param importId ID de la importación
     * @param options Opciones de importación
     * @returns Resultado del procesamiento
     */
    async processCSV(filePath, userId, importId, options) {
        const result = {
            recordsProcessed: 0,
            recordsImported: 0,
            recordsRejected: 0,
            errors: [],
        };
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe((0, csv_parser_1.default)({
                separator: (options === null || options === void 0 ? void 0 : options.delimiter) || ',',
                skipLines: (options === null || options === void 0 ? void 0 : options.skipRows) || 0,
                headers: (options === null || options === void 0 ? void 0 : options.hasHeaders) !== false,
            }))
                .on('data', (data) => {
                var _a;
                result.recordsProcessed++;
                try {
                    // Aplicar mapeo si existe
                    if (options === null || options === void 0 ? void 0 : options.mapping) {
                        const mappedData = {};
                        Object.entries(options.mapping).forEach(([target, source]) => {
                            mappedData[target] = data[source];
                        });
                        data = mappedData;
                    }
                    // Aquí iría la lógica para guardar los datos en MongoDB
                    // Por ahora solo incrementamos el contador
                    result.recordsImported++;
                }
                catch (error) {
                    result.recordsRejected++;
                    (_a = result.errors) === null || _a === void 0 ? void 0 : _a.push({
                        rowNumber: result.recordsProcessed,
                        message: error.message,
                    });
                }
            })
                .on('error', (error) => {
                reject(new fintech_personal_common_1.AppError(`Error al procesar CSV: ${error.message}`, 500));
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
    async processExcel(filePath, userId, importId, options) {
        var _a;
        const result = {
            recordsProcessed: 0,
            recordsImported: 0,
            recordsRejected: 0,
            errors: [],
        };
        try {
            const rows = await (0, node_1.default)(filePath, {
                sheet: (options === null || options === void 0 ? void 0 : options.sheet) || 1,
            });
            // Omitir filas de encabezado si es necesario
            const startRow = (options === null || options === void 0 ? void 0 : options.hasHeaders) !== false ? 1 : 0;
            const skipRows = (options === null || options === void 0 ? void 0 : options.skipRows) || 0;
            for (let i = startRow + skipRows; i < rows.length; i++) {
                result.recordsProcessed++;
                try {
                    const row = rows[i];
                    let data = {};
                    // Si hay encabezados, usar la primera fila como nombres de campo
                    if ((options === null || options === void 0 ? void 0 : options.hasHeaders) !== false) {
                        const headers = rows[0];
                        headers.forEach((header, index) => {
                            if (header) {
                                data[header.toString()] = row[index];
                            }
                        });
                    }
                    else {
                        // Sin encabezados, usar índices como nombres de campo
                        row.forEach((value, index) => {
                            data[`field${index}`] = value;
                        });
                    }
                    // Aplicar mapeo si existe
                    if (options === null || options === void 0 ? void 0 : options.mapping) {
                        const mappedData = {};
                        Object.entries(options.mapping).forEach(([target, source]) => {
                            mappedData[target] = data[source];
                        });
                        data = mappedData;
                    }
                    // Aquí iría la lógica para guardar los datos en MongoDB
                    // Por ahora solo incrementamos el contador
                    result.recordsImported++;
                }
                catch (error) {
                    result.recordsRejected++;
                    (_a = result.errors) === null || _a === void 0 ? void 0 : _a.push({
                        rowNumber: result.recordsProcessed + startRow,
                        message: error.message,
                    });
                }
            }
            return result;
        }
        catch (error) {
            throw new fintech_personal_common_1.AppError(`Error al procesar Excel: ${error.message}`, 500);
        }
    }
}
exports.default = FileProcessorService;
//# sourceMappingURL=file-processor.service.js.map