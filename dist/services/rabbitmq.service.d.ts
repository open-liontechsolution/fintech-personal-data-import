/**
 * Servicio para gestionar la comunicación con RabbitMQ
 */
declare class RabbitMQService {
    private client;
    private fileProcessor;
    private consumerTag;
    constructor();
    /**
     * Inicializa el servicio y configura el consumidor
     */
    initialize(): Promise<void>;
    /**
     * Maneja los mensajes recibidos del exchange
     * @param message Mensaje recibido
     */
    private handleMessage;
    /**
     * Envía actualizaciones de estado del procesamiento
     * @param data Datos del estado de importación
     */
    sendStatusUpdate(data: {
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
    }): Promise<void>;
    /**
     * Cierra la conexión con RabbitMQ
     */
    close(): Promise<void>;
}
export default RabbitMQService;
