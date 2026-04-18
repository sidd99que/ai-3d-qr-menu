import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { ValidationPipe, Logger } from '@nestjs/common'; // ✅ Add Logger

async function bootstrap() {
  const logger = new Logger('Bootstrap'); // ✅ Create logger

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const dataSource = app.get(DataSource);

  if (dataSource.isInitialized) {
    logger.log('✅ Database has been connected successfully!');
  }

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`🚀 Backend running on http://localhost:${port}`);
}

bootstrap();