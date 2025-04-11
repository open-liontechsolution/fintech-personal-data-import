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
declare const config: AppConfig;
export default config;
