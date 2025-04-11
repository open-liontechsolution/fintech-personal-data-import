"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const config_1 = __importDefault(require("../config/config"));
/**
 * Logger configurado para la aplicación
 */
const logger = (0, pino_1.default)({
    level: config_1.default.app.logLevel,
    transport: config_1.default.app.env === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    base: { pid: process.pid, app: 'data-import' },
});
exports.default = logger;
//# sourceMappingURL=logger.js.map