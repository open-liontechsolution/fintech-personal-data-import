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
   * Maneja los mensajes recibidos del exchange
   * @param message Mensaje recibido
   */
  private async handleMessage(message: FileUploadedEvent): Promise<void> {
    const { fileId, fileName, fileType, userId, importOptions } = message.data;
    const importId = uuidv4();
    
    logger.info({
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
      
      logger.info({
        importId,
        fileId,
        recordsProcessed: result.recordsProcessed,
        recordsImported: result.recordsImported,
      }, 'Archivo procesado con éxito');
    } catch (error) {
      logger.error({
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
        message: `Error al procesar archivo: ${(error as Error).message}`,
        result: {
          recordsProcessed: 0,
          recordsImported: 0,
          recordsRejected: 0,
          errors: [{
            message: (error as Error).message,
          }],
        },
      });
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
  async close(): Promise<void> {
    if (this.consumerTag) {
      await this.client.cancelConsumer(this.consumerTag);
    }
    await this.client.close();
    logger.info('Conexión con RabbitMQ cerrada');
  }
}

export default RabbitMQService;
