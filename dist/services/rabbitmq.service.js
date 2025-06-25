"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fintech_personal_common_1 = require("fintech-personal-common");
const uuid_1 = require("uuid");
const config_1 = __importDefault(require("../config/config"));
const logger_1 = __importDefault(require("../utils/logger"));
// Importación desde el archivo de barril
const _1 = require(".");
/**
 * Servicio para gestionar la comunicación con RabbitMQ
 */
class RabbitMQService {
    constructor() {
        this.consumerTag = null;
        this.client = new fintech_personal_common_1.RabbitMQClient({
            url: config_1.default.rabbitmq.url,
            exchange: config_1.default.rabbitmq.exchange,
            exchangeType: config_1.default.rabbitmq.exchangeType,
        });
        this.fileProcessor = new _1.FileProcessorService();
    }
    /**
     * Inicializa el servicio y configura el consumidor
     */
    async initialize() {
        try {
            await this.client.connect();
            const consumeOptions = {
                queue: config_1.default.rabbitmq.queue,
                routingKey: config_1.default.rabbitmq.routingKey,
                prefetch: config_1.default.processing.maxConcurrent,
                durable: true,
                autoDelete: false,
            };
            this.consumerTag = await this.client.consume(consumeOptions, this.handleMessage.bind(this));
            logger_1.default.info({ consumeOptions }, 'RabbitMQ consumidor configurado');
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error al inicializar RabbitMQ');
            throw error;
        }
    }
    /**
     * Procesa un mensaje de archivo subido
     */
    async handleMessage(message) {
        const { fileId, fileName, userId } = message.data;
        logger_1.default.info({
            eventId: message.eventId,
            fileId,
            fileName,
            userId,
        }, 'Procesando mensaje de archivo subido');
        try {
            // Enviar actualización de estado inicial
            await this.sendStatusUpdate({
                fileId,
                importId: message.eventId, // Usar eventId como importId temporal
                status: 'processing',
                progress: 0,
                message: 'Iniciando procesamiento de archivo',
                userId,
            });
            // Procesar archivo
            const result = await this.fileProcessor.processFile(message);
            // Enviar actualización de estado final
            await this.sendStatusUpdate({
                fileId,
                importId: result.importId,
                status: result.status,
                progress: 100,
                message: `Procesamiento completado: ${result.importedRows} registros importados`,
                userId,
                result: {
                    recordsProcessed: result.totalRows,
                    recordsImported: result.importedRows,
                    recordsRejected: result.failedRows,
                    errors: result.errors.map(err => ({
                        rowNumber: err.rowNumber,
                        message: err.message || err.error || 'Error desconocido'
                    }))
                },
            });
            logger_1.default.info({
                importId: result.importId,
                fileId,
                totalRows: result.totalRows,
                importedRows: result.importedRows,
                failedRows: result.failedRows,
            }, 'Archivo procesado exitosamente');
        }
        catch (error) {
            logger_1.default.error({
                error,
                fileId,
                fileName,
            }, 'Error al procesar archivo');
            // Enviar actualización de error
            await this.sendStatusUpdate({
                fileId,
                importId: message.eventId,
                status: 'failed',
                progress: 0,
                message: error instanceof Error ? error.message : 'Error desconocido',
                userId,
                result: {
                    recordsProcessed: 0,
                    recordsImported: 0,
                    recordsRejected: 0,
                    errors: [{
                            rowNumber: undefined,
                            message: error instanceof Error ? error.message : 'Error desconocido'
                        }]
                },
            });
            // Re-lanzar el error para que RabbitMQ maneje el reintento
            throw error;
        }
    }
    /**
     * Envía actualizaciones de estado del procesamiento
     * @param data Datos del estado de importación
     */
    async sendStatusUpdate(data) {
        try {
            const statusEvent = {
                eventId: (0, uuid_1.v4)(),
                eventType: 'FileImportStatusUpdate',
                timestamp: new Date().toISOString(),
                data: {
                    importId: data.importId,
                    fileId: data.fileId,
                    userId: data.userId,
                    status: data.status,
                    progress: data.progress,
                    message: data.message,
                    result: data.result,
                },
            };
            const publishOptions = {
                routingKey: config_1.default.rabbitmq.statusRoutingKey,
                persistent: true,
                messageId: (0, uuid_1.v4)(),
            };
            await this.client.publish(statusEvent, publishOptions);
            logger_1.default.debug({
                status: data.status,
                progress: data.progress,
                importId: data.importId,
                fileId: data.fileId,
            }, 'Estado de importación actualizado');
        }
        catch (error) {
            logger_1.default.error({
                error,
                data,
            }, 'Error al enviar actualización de estado');
        }
    }
    /**
     * Cierra la conexión con RabbitMQ
     */
    async disconnect() {
        if (this.consumerTag) {
            await this.client.cancelConsumer(this.consumerTag);
            this.consumerTag = null;
        }
        await this.client.close();
        logger_1.default.info('Conexión con RabbitMQ cerrada');
    }
    /**
     * Alias para disconnect (mantener compatibilidad)
     */
    async close() {
        await this.disconnect();
    }
    /**
     * Verifica el estado de la conexión con RabbitMQ
     */
    async healthCheck() {
        try {
            // Verificar si el cliente está inicializado
            const isConnected = this.client !== null;
            return {
                status: isConnected ? 'connected' : 'disconnected',
                connected: isConnected
            };
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error en health check de RabbitMQ');
            return {
                status: 'error',
                connected: false
            };
        }
    }
}
exports.default = RabbitMQService;
//# sourceMappingURL=rabbitmq.service.js.map