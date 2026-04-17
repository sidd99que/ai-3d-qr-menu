import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConvertService } from './convert.service';

@Controller('convert')
export class ConvertController {
  constructor(private readonly convertService: ConvertService) {}

  // POST /api/convert/start
  // Frontend sends image file + dish name
  @Post('start')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/image\/(jpg|jpeg|png|webp)/)) {
          return cb(new BadRequestException('Only JPG, PNG, WEBP allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async startConversion(
    @UploadedFile() file: Express.Multer.File,
    @Body('dishName') dishName: string,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    if (!dishName) throw new BadRequestException('Dish name is required');

    const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:3000';

    const result = await this.convertService.startConversion(
      file,
      dishName,
      frontendUrl,
    );

    return {
      success: true,
      taskId: result.taskId,
      qrCode: result.qrCode,
      message: 'Conversion started! Check status every 5 seconds.',
    };
  }

  // GET /api/convert/status/:taskId
  // Frontend polls this until status = success
  @Get('status/:taskId')
  async getStatus(@Param('taskId') taskId: string) {
    const result = await this.convertService.checkStatus(taskId);
    return {
      success: true,
      ...result,
    };
  }
}
