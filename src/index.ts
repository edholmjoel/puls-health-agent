import dotenv from 'dotenv';
dotenv.config();

import 'express-async-errors';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import junctionWebhookRouter from './routes/webhook-junction';
import twilioWebhookRouter from './routes/webhook-twilio';
import { initializeJobs } from './jobs';
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(requestLogger);

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use('/webhooks/junction', junctionWebhookRouter);
app.use('/webhooks/twilio', twilioWebhookRouter);

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Puls Health Agent',
    version: '1.0.0',
    description: 'AI health coaching agent via WhatsApp',
    endpoints: {
      health: '/health',
      webhooks: {
        junction: '/webhooks/junction',
        twilio: '/webhooks/twilio',
      },
    },
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
  });
});

app.use(errorHandler);

function startServer(): void {
  try {
    logger.info('Starting Puls Health Agent server');

    initializeJobs();

    app.listen(PORT, () => {
      logger.info('Server started successfully', {
        port: PORT,
        nodeEnv: process.env.NODE_ENV || 'development',
      });

      logger.info('Available endpoints', {
        health: `/health`,
        junctionWebhook: `/webhooks/junction`,
        twilioWebhook: `/webhooks/twilio`,
      });
    });
  } catch (error: any) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
