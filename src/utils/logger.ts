import pino from 'pino';
import config from '../config/config';

/**
 * Logger configurado para la aplicación
 */
const logger = pino({
  level: config.app.logLevel,
  transport: config.app.env === 'development' 
    ? { target: 'pino-pretty' } 
    : undefined,
  base: { pid: process.pid, app: 'data-import' },
});

export default logger;
