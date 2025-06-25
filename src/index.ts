import express from 'express';
import { createServer } from 'http';
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
