import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env si existe
dotenv.config();

export interface AppConfig {
  app: {
    env: string;
    port: number;
    logLevel: string;
    tempDir: string;
  };
  mongodb: {
    uri: string;
    dbName: string;
  };
  rabbitmq: {
    url: string;
    exchange: string;
    exchangeType: 'direct' | 'topic' | 'fanout' | 'headers';
    queue: string;
    routingKey: string;
    errorQueue: string;
    errorRoutingKey: string;
    statusRoutingKey: string;
  };
  processing: {
    maxConcurrent: number;
    deleteAfterProcessing: boolean;
  };
}

/**
 * Configuración de la aplicación
 */
const config: AppConfig = {
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3001'),
    logLevel: process.env.LOG_LEVEL || 'info',
    tempDir: process.env.TEMP_FILES_DIR || path.join(process.cwd(), 'tmp'),
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/fintech',
    dbName: process.env.MONGODB_DB_NAME || 'fintech',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'fintech-events',
    exchangeType: (process.env.RABBITMQ_EXCHANGE_TYPE || 'topic') as 'direct' | 'topic' | 'fanout' | 'headers',
    queue: process.env.RABBITMQ_QUEUE || 'file-import-queue',
    routingKey: process.env.RABBITMQ_ROUTING_KEY || 'file.uploaded',
    errorQueue: process.env.RABBITMQ_ERROR_QUEUE || 'file-import-error-queue',
    errorRoutingKey: process.env.RABBITMQ_ERROR_ROUTING_KEY || 'file.import.error',
    statusRoutingKey: process.env.RABBITMQ_STATUS_ROUTING_KEY || 'file.import.status',
  },
  processing: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_PROCESSING || '3'),
    deleteAfterProcessing: process.env.DELETE_AFTER_PROCESSING === 'true',
  },
};

export default config;
