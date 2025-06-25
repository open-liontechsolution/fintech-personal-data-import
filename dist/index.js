"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const config_1 = __importDefault(require("./config/config"));
const logger_1 = __importDefault(require("./utils/logger"));
const services_1 = require("./services");
/**
 * Aplicación principal del servicio de importación de datos
 */
class DataImportApp {
    constructor() {
        this.isShuttingDown = false;
        this.app = (0, express_1.default)();
        this.rabbitMQService = new services_1.RabbitMQService();
        this.mongoDBService = services_1.MongoDBService;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupGracefulShutdown();
    }
    /**
     * Configura middleware básico
     */
    setupMiddleware() {
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: true }));
        // Middleware de logging
        this.app.use((req, res, next) => {
            logger_1.default.info({
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
    setupRoutes() {
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
            }
            catch (error) {
                logger_1.default.error({ error }, 'Health check failed');
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
                environment: config_1.default.app.env,
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
        this.app.use((error, req, res, next) => {
            logger_1.default.error({ error, url: req.url, method: req.method }, 'Unhandled error');
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: config_1.default.app.env === 'development' ? error.message : 'Something went wrong',
                    timestamp: new Date().toISOString()
                });
            }
        });
    }
    /**
     * Inicializa todos los servicios
     */
    async initialize() {
        try {
            logger_1.default.info('Inicializando servicios...');
            // Conectar a MongoDB
            await this.mongoDBService.connect();
            logger_1.default.info('MongoDB conectado');
            // Inicializar RabbitMQ
            await this.rabbitMQService.initialize();
            logger_1.default.info('RabbitMQ inicializado');
            logger_1.default.info('Todos los servicios inicializados correctamente');
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error al inicializar servicios');
            throw error;
        }
    }
    /**
     * Inicia el servidor HTTP
     */
    async start() {
        try {
            await this.initialize();
            this.server = (0, http_1.createServer)(this.app);
            this.server.listen(config_1.default.app.port, () => {
                logger_1.default.info({
                    port: config_1.default.app.port,
                    env: config_1.default.app.env,
                    logLevel: config_1.default.app.logLevel
                }, 'Servidor iniciado');
            });
            this.server.on('error', (error) => {
                logger_1.default.error({ error }, 'Error del servidor');
                process.exit(1);
            });
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error al iniciar la aplicación');
            process.exit(1);
        }
    }
    /**
     * Detiene la aplicación de forma elegante
     */
    async stop() {
        if (this.isShuttingDown) {
            return;
        }
        this.isShuttingDown = true;
        logger_1.default.info('Iniciando cierre elegante...');
        try {
            // Cerrar servidor HTTP
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(() => {
                        logger_1.default.info('Servidor HTTP cerrado');
                        resolve();
                    });
                });
            }
            // Cerrar servicios
            await this.rabbitMQService.disconnect();
            logger_1.default.info('RabbitMQ desconectado');
            await this.mongoDBService.disconnect();
            logger_1.default.info('MongoDB desconectado');
            logger_1.default.info('Cierre elegante completado');
        }
        catch (error) {
            logger_1.default.error({ error }, 'Error durante el cierre elegante');
        }
    }
    /**
     * Configura el manejo de señales para cierre elegante
     */
    setupGracefulShutdown() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        signals.forEach((signal) => {
            process.on(signal, async () => {
                logger_1.default.info({ signal }, 'Señal de cierre recibida');
                await this.stop();
                process.exit(0);
            });
        });
        process.on('uncaughtException', (error) => {
            logger_1.default.error({ error }, 'Excepción no capturada');
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.default.error({ reason, promise }, 'Promesa rechazada no manejada');
            process.exit(1);
        });
    }
}
// Iniciar la aplicación si este archivo se ejecuta directamente
if (require.main === module) {
    const app = new DataImportApp();
    app.start().catch((error) => {
        logger_1.default.error({ error }, 'Error fatal al iniciar la aplicación');
        process.exit(1);
    });
}
exports.default = DataImportApp;
//# sourceMappingURL=index.js.map