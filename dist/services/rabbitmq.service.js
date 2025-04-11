"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fintech_personal_common_1 = require("fintech-personal-common");
const uuid_1 = require("uuid");
const config_1 = __importDefault(require("../config/config"));
const logger_1 = __importDefault(require("../utils/logger"));
const file_processor_service_1 = __importDefault(require("./file-processor.service"));
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
        this.fileProcessor = new file_processor_service_1.default();
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
     * Maneja los mensajes recibidos del exchange
     * @param message Mensaje recibido
     */
    async handleMessage(message) {
        const { fileId, fileName, fileType, userId, importOptions } = message.data;
        const importId = (0, uuid_1.v4)();
        logger_1.default.info({
            importId,
            fileId,
            fileName,
            fileType,
            userId,
        }, 'Recibida solicitud de procesamiento de archivo');
        try {
            // Enviar estado inicial de procesamiento
            await this.sendStatusUpdate({
                importId,
                fileId,
                userId,
                status: 'processing',
                progress: 0,
                message: 'Iniciando procesamiento',
                result: {
                    recordsProcessed: 0,
                    recordsImported: 0,
                    recordsRejected: 0,
                },
            });
            // Procesar el archivo
            const result = await this.fileProcessor.processFile(fileId, fileName, fileType, userId, importId, importOptions);
            // Enviar estado final de procesamiento
            await this.sendStatusUpdate({
                importId,
                fileId,
                userId,
                status: 'completed',
                progress: 100,
                message: 'Procesamiento completado con éxito',
                result: {
                    recordsProcessed: result.recordsProcessed,
                    recordsImported: result.recordsImported,
                    recordsRejected: result.recordsRejected,
                    errors: result.errors,
                },
            });
            logger_1.default.info({
                importId,
                fileId,
                recordsProcessed: result.recordsProcessed,
                recordsImported: result.recordsImported,
            }, 'Archivo procesado con éxito');
        }
        catch (error) {
            logger_1.default.error({
                importId,
                fileId,
                error,
            }, 'Error al procesar archivo');
            // Enviar estado de error
            await this.sendStatusUpdate({
                importId,
                fileId,
                userId,
                status: 'failed',
                progress: 0,
                message: `Error al procesar archivo: ${error.message}`,
                result: {
                    recordsProcessed: 0,
                    recordsImported: 0,
                    recordsRejected: 0,
                    errors: [{
                            message: error.message,
                        }],
                },
            });
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
    async close() {
        if (this.consumerTag) {
            await this.client.cancelConsumer(this.consumerTag);
        }
        await this.client.close();
        logger_1.default.info('Conexión con RabbitMQ cerrada');
    }
}
exports.default = RabbitMQService;
//# sourceMappingURL=rabbitmq.service.js.map