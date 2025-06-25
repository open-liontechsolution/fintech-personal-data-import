/**
 * Aplicación principal del servicio de importación de datos
 */
declare class DataImportApp {
    private app;
    private server;
    private rabbitMQService;
    private mongoDBService;
    private isShuttingDown;
    constructor();
    /**
     * Configura middleware básico
     */
    private setupMiddleware;
    /**
     * Configura las rutas básicas
     */
    private setupRoutes;
    /**
     * Inicializa todos los servicios
     */
    initialize(): Promise<void>;
    /**
     * Inicia el servidor HTTP
     */
    start(): Promise<void>;
    /**
     * Detiene la aplicación de forma elegante
     */
    stop(): Promise<void>;
    /**
     * Configura el manejo de señales para cierre elegante
     */
    private setupGracefulShutdown;
}
export default DataImportApp;
