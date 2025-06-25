import { RabbitMQClient, ConsumeOptions, PublishOptions, FileUploadedEvent, FileImportStatusUpdateEvent } from 'fintech-personal-common';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config';
import logger from '../utils/logger';
// Importación desde el archivo de barril
import { FileProcessorService } from '.';
/**
 * Servicio para gestionar la comunicación con RabbitMQ
 */
class RabbitMQService {
  private client: RabbitMQClient;
  private fileProcessor: FileProcessorService;
  private consumerTag: string | null = null;

  constructor() {
    this.client = new RabbitMQClient({
      url: config.rabbitmq.url,
      exchange: config.rabbitmq.exchange,
      exchangeType: config.rabbitmq.exchangeType,
    });
    
    this.fileProcessor = new FileProcessorService();
  }

  /**
   * Inicializa el servicio y configura el consumidor
   */
  async initialize(): Promise<void> {
    try {
      await this.client.connect();
      
      const consumeOptions: ConsumeOptions = {
        queue: config.rabbitmq.queue,
        routingKey: config.rabbitmq.routingKey,
        prefetch: config.processing.maxConcurrent,
        durable: true,
        autoDelete: false,
      };
      
      this.consumerTag = await this.client.consume<FileUploadedEvent>(
        consumeOptions,
        this.handleMessage.bind(this)
      );
      
      logger.info({ consumeOptions }, 'RabbitMQ consumidor configurado');
    } catch (error) {
      logger.error({ error }, 'Error al inicializar RabbitMQ');
      throw error;
    }
  }

  /**
   * Procesa un mensaje de archivo subido
   */
  private async handleMessage(message: FileUploadedEvent): Promise<void> {
    const { fileId, fileName, userId } = message.data;
    
    logger.info({
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
      
      logger.info({
        importId: result.importId,
        fileId,
        totalRows: result.totalRows,
        importedRows: result.importedRows,
        failedRows: result.failedRows,
      }, 'Archivo procesado exitosamente');
      
    } catch (error) {
      logger.error({
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
  async sendStatusUpdate(data: {
    importId: string;
    fileId: string;
    userId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message?: string;
    result?: {
      recordsProcessed: number;
      recordsImported: number;
      recordsRejected: number;
      errors?: Array<{
        rowNumber?: number;
        message: string;
      }>;
    };
  }): Promise<void> {
    try {
      const statusEvent: FileImportStatusUpdateEvent = {
        eventId: uuidv4(),
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
      
      const publishOptions: PublishOptions = {
        routingKey: config.rabbitmq.statusRoutingKey,
        persistent: true,
        messageId: uuidv4(),
      };
      
      await this.client.publish<FileImportStatusUpdateEvent>(
        statusEvent,
        publishOptions
      );
      
      logger.debug({
        status: data.status,
        progress: data.progress,
        importId: data.importId,
        fileId: data.fileId,
      }, 'Estado de importación actualizado');
    } catch (error) {
      logger.error({
        error,
        data,
      }, 'Error al enviar actualización de estado');
    }
  }

  /**
   * Cierra la conexión con RabbitMQ
   */
  async disconnect(): Promise<void> {
    if (this.consumerTag) {
      await this.client.cancelConsumer(this.consumerTag);
      this.consumerTag = null;
    }
    await this.client.close();
    logger.info('Conexión con RabbitMQ cerrada');
  }

  /**
   * Alias para disconnect (mantener compatibilidad)
   */
  async close(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Verifica el estado de la conexión con RabbitMQ
   */
  async healthCheck(): Promise<{ status: string; connected?: boolean }> {
    try {
      // Verificar si el cliente está inicializado
      const isConnected = this.client !== null;
      return {
        status: isConnected ? 'connected' : 'disconnected',
        connected: isConnected
      };
    } catch (error) {
      logger.error({ error }, 'Error en health check de RabbitMQ');
      return {
        status: 'error',
        connected: false
      };
    }
  }
}

export default RabbitMQService;
