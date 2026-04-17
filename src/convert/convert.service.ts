import { Injectable } from '@nestjs/common';
import { TripoService } from './tripo.service';
import * as QRCode from 'qrcode';

@Injectable()
export class ConvertService {
  constructor(private readonly tripoService: TripoService) {}

  // Start conversion: upload image → start task → return taskId + QR
  async startConversion(
    file: Express.Multer.File,
    dishName: string,
    frontendUrl: string,
  ): Promise<{ taskId: string; qrCode: string }> {
    // 1. Upload image to Tripo
    const fileToken = await this.tripoService.uploadImage(file);

    // 2. Start 3D generation
    const taskId = await this.tripoService.startGeneration(
      fileToken,
      file.mimetype,
    );

    // 3. Generate QR code pointing to viewer page
    const viewerUrl = `${frontendUrl}/view/${taskId}?name=${encodeURIComponent(dishName)}`;
    const qrCode = await QRCode.toDataURL(viewerUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return { taskId, qrCode };
  }

  // Check status and return result
  async checkStatus(taskId: string) {
    return this.tripoService.checkStatus(taskId);
  }
}
