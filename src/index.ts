import express from 'express';
import { createServer } from 'http';
import multer from 'multer';
import { GridFSBucket, ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import config from './config/config';
import logger from './utils/logger';
import { RabbitMQService, MongoDBService } from './services';

/**
 * Aplicación principal del servicio de importación de datos
 */
class DataImportApp {
  private app: express.Application;
  private server: any;
  private rabbitMQService: RabbitMQService;
  private mongoDBService: typeof MongoDBService;
  private isShuttingDown = false;

  constructor() {
    this.app = express();
    this.rabbitMQService = new RabbitMQService();
    this.mongoDBService = MongoDBService;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupGracefulShutdown();
  }

  /**
   * Configura middleware básico
   */
  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Middleware de logging
    this.app.use((req, res, next) => {
      logger.info({
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      }, 'HTTP Request');
      next();
    });
  }

  /**
   * Configura las rutas básicas
   */
  private setupRoutes(): void {
    // Configurar multer para archivos en memoria (luego los pasamos a GridFS)
    const upload = multer({ 
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB máximo
      },
      fileFilter: (req, file, cb) => {
        // Aceptar archivos Excel, CSV y texto
        const allowedMimes = [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
          'text/plain',
          'application/octet-stream'
        ];
        
        const allowedExtensions = ['.xls', '.xlsx', '.csv', '.txt'];
        const hasValidExtension = allowedExtensions.some(ext => 
          file.originalname.toLowerCase().endsWith(ext)
        );
        
        if (allowedMimes.includes(file.mimetype) || hasValidExtension) {
          cb(null, true);
        } else {
          cb(new Error(`Tipo de archivo no soportado: ${file.mimetype}. Formatos permitidos: Excel (.xls, .xlsx), CSV (.csv), Text (.txt)`));
        }
      }
    });

    // Upload endpoint
    this.app.post('/upload', upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            error: 'No file provided',
            message: 'Please provide a file using the "file" field',
            timestamp: new Date().toISOString()
          });
        }

        const db = MongoDBService.getDB();
        if (!db) {
          throw new Error('Database not connected');
        }

        // Usar GridFS para almacenar el archivo
        const bucket = new GridFSBucket(db, { bucketName: 'fs' });
        
        // Generar ID único para el archivo
        const fileId = new ObjectId();
        const uploadId = uuidv4();

        // Metadata del archivo
        const metadata = {
          uploadId,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          uploadedAt: new Date(),
          userId: req.body.userId || 'anonymous', // Opcional desde el form
          bankName: req.body.bankName || 'unknown', // Opcional desde el form
          description: req.body.description || '',
        };

        // Crear stream de upload a GridFS
        const uploadStream = bucket.openUploadStreamWithId(fileId, req.file.originalname, {
          metadata
        });

        // Promesa para manejar la subida
        const uploadPromise = new Promise<ObjectId>((resolve, reject) => {
          uploadStream.on('error', reject);
          uploadStream.on('finish', () => {
            logger.info({
              fileId: fileId.toString(),
              uploadId,
              fileName: req.file!.originalname,
              size: req.file!.size
            }, 'File uploaded to GridFS successfully');
            resolve(fileId);
          });
        });

        // Escribir el buffer al stream
        uploadStream.end(req.file.buffer);

        // Esperar a que se complete la subida
        await uploadPromise;

        // Respuesta exitosa (SIN enviar mensaje a RabbitMQ)
        res.status(201).json({
          success: true,
          message: 'File uploaded successfully',
          data: {
            fileId: fileId.toString(),
            uploadId,
            fileName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedAt: metadata.uploadedAt.toISOString(),
            metadata
          },
          note: 'File is stored in GridFS but not yet queued for processing. Use RabbitMQ to trigger processing.',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error({ error, fileName: req.file?.originalname }, 'Error uploading file');
        
        res.status(500).json({
          error: 'Upload failed',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const mongoHealth = await this.mongoDBService.healthCheck();
        const rabbitHealth = await this.rabbitMQService.healthCheck();
        
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            mongodb: mongoHealth,
            rabbitmq: rabbitHealth
          },
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.env.npm_package_version || '1.0.0'
        };

        res.status(200).json(health);
      } catch (error) {
        logger.error({ error }, 'Health check failed');
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        service: 'fintech-personal-data-import',
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: config.app.env,
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // Metrics endpoint (básico)
    this.app.get('/metrics', (req, res) => {
      const metrics = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        timestamp: new Date().toISOString()
      };
      res.json(metrics);
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });

    // Error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error({ error, url: req.url, method: req.method }, 'Unhandled error');
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: config.app.env === 'development' ? error.message : 'Something went wrong',
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Inicializa todos los servicios
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Inicializando servicios...');

      // Conectar a MongoDB
      await this.mongoDBService.connect();
      logger.info('MongoDB conectado');

      // Inicializar RabbitMQ
      await this.rabbitMQService.initialize();
      logger.info('RabbitMQ inicializado');

      logger.info('Todos los servicios inicializados correctamente');
    } catch (error) {
      logger.error({ error }, 'Error al inicializar servicios');
      throw error;
    }
  }

  /**
   * Inicia el servidor HTTP
   */
  async start(): Promise<void> {
    try {
      await this.initialize();

      this.server = createServer(this.app);
      
      this.server.listen(config.app.port, () => {
        logger.info({
          port: config.app.port,
          env: config.app.env,
          logLevel: config.app.logLevel
        }, 'Servidor iniciado');
      });

      this.server.on('error', (error: Error) => {
        logger.error({ error }, 'Error del servidor');
        process.exit(1);
      });

    } catch (error) {
      logger.error({ error }, 'Error al iniciar la aplicación');
      process.exit(1);
    }
  }

  /**
   * Detiene la aplicación de forma elegante
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Iniciando cierre elegante...');

    try {
      // Cerrar servidor HTTP
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(() => {
            logger.info('Servidor HTTP cerrado');
            resolve();
          });
        });
      }

      // Cerrar servicios
      await this.rabbitMQService.disconnect();
      logger.info('RabbitMQ desconectado');

      await this.mongoDBService.disconnect();
      logger.info('MongoDB desconectado');

      logger.info('Cierre elegante completado');
    } catch (error) {
      logger.error({ error }, 'Error durante el cierre elegante');
    }
  }

  /**
   * Configura el manejo de señales para cierre elegante
   */
  private setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info({ signal }, 'Señal de cierre recibida');
        await this.stop();
        process.exit(0);
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Excepción no capturada');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Promesa rechazada no manejada');
      process.exit(1);
    });
  }
}

// Iniciar la aplicación si este archivo se ejecuta directamente
if (require.main === module) {
  const app = new DataImportApp();
  app.start().catch((error) => {
    logger.error({ error }, 'Error fatal al iniciar la aplicación');
    process.exit(1);
  });
}

export default DataImportApp;
