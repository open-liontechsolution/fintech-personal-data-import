"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RabbitMQService = exports.MongoDBService = exports.FileProcessorService = void 0;
// Archivo de barril (barrel file) para exportar todos los servicios
var file_processor_service_1 = require("./file-processor.service");
Object.defineProperty(exports, "FileProcessorService", { enumerable: true, get: function () { return __importDefault(file_processor_service_1).default; } });
var mongodb_service_1 = require("./mongodb.service");
Object.defineProperty(exports, "MongoDBService", { enumerable: true, get: function () { return __importDefault(mongodb_service_1).default; } });
var rabbitmq_service_1 = require("./rabbitmq.service");
Object.defineProperty(exports, "RabbitMQService", { enumerable: true, get: function () { return __importDefault(rabbitmq_service_1).default; } });
//# sourceMappingURL=index.js.map