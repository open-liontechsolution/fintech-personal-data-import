"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const multer_1 = __importDefault(require("multer"));
const mongodb_1 = require("mongodb");
const uuid_1 = require("uuid");
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
        // Configurar multer para archivos en memoria (luego los pasamos a GridFS)
        const upload = (0, multer_1.default)({
            storage: multer_1.default.memoryStorage(),
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
                const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
                if (allowedMimes.includes(file.mimetype) || hasValidExtension) {
                    cb(null, true);
                }
                else {
                    cb(new Error(`Tipo de archivo no soportado: ${file.mimetype}. Formatos permitidos: Excel (.xls, .xlsx), CSV (.csv), Text (.txt)`));
                }
            }
        });
        // Upload endpoint
        this.app.post('/upload', upload.single('file'), async (req, res) => {
            var _a;
            try {
                if (!req.file) {
                    return res.status(400).json({
                        error: 'No file provided',
                        message: 'Please provide a file using the "file" field',
                        timestamp: new Date().toISOString()
                    });
                }
                const db = services_1.MongoDBService.getDB();
                if (!db) {
                    throw new Error('Database not connected');
                }
                // Usar GridFS para almacenar el archivo
                const bucket = new mongodb_1.GridFSBucket(db, { bucketName: 'fs' });
                // Generar ID único para el archivo
                const fileId = new mongodb_1.ObjectId();
                const uploadId = (0, uuid_1.v4)();
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
                const uploadPromise = new Promise((resolve, reject) => {
                    uploadStream.on('error', reject);
                    uploadStream.on('finish', () => {
                        logger_1.default.info({
                            fileId: fileId.toString(),
                            uploadId,
                            fileName: req.file.originalname,
                            size: req.file.size
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
            }
            catch (error) {
                logger_1.default.error({ error, fileName: (_a = req.file) === null || _a === void 0 ? void 0 : _a.originalname }, 'Error uploading file');
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