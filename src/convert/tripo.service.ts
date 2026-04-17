import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';

@Injectable()
export class TripoService {
  private readonly apiKey = process.env.TRIPO_API_KEY;
  private readonly baseUrl = 'https://api.tripo3d.ai/v2/openapi';

  async uploadImage(file: Express.Multer.File): Promise<string> {
    try {
      console.log('📤 [uploadImage] Starting upload...');
      console.log('📤 [uploadImage] File name:', file.originalname);
      console.log('📤 [uploadImage] File mimetype:', file.mimetype);
      console.log('📤 [uploadImage] File size:', file.size, 'bytes');
      console.log('📤 [uploadImage] API Key exists:', !!this.apiKey);
      console.log('📤 [uploadImage] Upload URL:', `${this.baseUrl}/upload/sts`);

      const formData = new FormData();
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const response = await axios.post(
        `${this.baseUrl}/upload/sts`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...formData.getHeaders(),
          },
        },
      );

      console.log('✅ [uploadImage] Response status:', response.status);
      console.log('✅ [uploadImage] Full response data:', JSON.stringify(response.data, null, 2));
      console.log('✅ [uploadImage] Image token:', response.data.data.image_token);

      return response.data.data.image_token;
    } catch (err) {
      const error = err as AxiosError;
      console.error('❌ [uploadImage] Error status:', error.response?.status);
      console.error('❌ [uploadImage] Error data:', JSON.stringify(error.response?.data, null, 2));
      console.error('❌ [uploadImage] Error message:', error.message);
      throw new InternalServerErrorException('Failed to upload image to Tripo');
    }
  }

  async startGeneration(fileToken: string, fileType: string): Promise<string> {
    try {
      console.log('🚀 [startGeneration] Starting generation...');
      console.log('🚀 [startGeneration] File token:', fileToken);
      console.log('🚀 [startGeneration] File type:', fileType);
      console.log('🚀 [startGeneration] Task URL:', `${this.baseUrl}/task`);

      const payload = {
        type: 'image_to_model',
        file: {
          type: fileType === 'image/png' ? 'png' : 'jpg',
          file_token: fileToken,
        },
        model_version: 'v2.5-20250123',
        texture: true,
        pbr: true,
      };

      console.log('🚀 [startGeneration] Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.baseUrl}/task`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('✅ [startGeneration] Response status:', response.status);
      console.log('✅ [startGeneration] Full response data:', JSON.stringify(response.data, null, 2));
      console.log('✅ [startGeneration] Task ID:', response.data.data.task_id);

      return response.data.data.task_id;
    } catch (err) {
      const error = err as AxiosError;
      console.error('❌ [startGeneration] Error status:', error.response?.status);
      console.error('❌ [startGeneration] Error data:', JSON.stringify(error.response?.data, null, 2));
      console.error('❌ [startGeneration] Error message:', error.message);
      throw new InternalServerErrorException('Failed to start 3D generation');
    }
  }

  async checkStatus(taskId: string): Promise<{
    status: string;
    progress?: number;
    glbUrl?: string;
  }> {
    try {
      console.log('🔍 [checkStatus] Checking status for task:', taskId);
      console.log('🔍 [checkStatus] Status URL:', `${this.baseUrl}/task/${taskId}`);

      const response = await axios.get(
        `${this.baseUrl}/task/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      console.log('✅ [checkStatus] Response status:', response.status);
      console.log('✅ [checkStatus] Full response data:', JSON.stringify(response.data, null, 2));

      const task = response.data.data;

      console.log('🔍 [checkStatus] Task status:', task.status);
      console.log('🔍 [checkStatus] Task progress:', task.progress);

      if (task.status === 'success') {
        console.log('🎉 [checkStatus] Task completed!');
        console.log('🎉 [checkStatus] Full output:', JSON.stringify(task.output, null, 2));
        console.log('🎉 [checkStatus] output.model:', task.output?.model);
        console.log('🎉 [checkStatus] output.pbr_model:', task.output?.pbr_model);
        console.log('🎉 [checkStatus] output.rendered_image:', task.output?.rendered_image);

        const glbUrl =
          task.output?.pbr_model?.url ||
          task.output?.model?.url ||
          task.output?.pbr_model ||
          task.output?.model;

        console.log('🎉 [checkStatus] Final glbUrl being returned:', glbUrl);

        return {
          status: 'success',
          glbUrl,
        };
      } else if (task.status === 'failed') {
        console.error('❌ [checkStatus] Task failed!');
        console.error('❌ [checkStatus] Failure details:', JSON.stringify(task, null, 2));
        return { status: 'failed' };
      } else {
        console.log('⏳ [checkStatus] Task still processing...');
        console.log('⏳ [checkStatus] Progress:', task.progress || 0);
        return {
          status: 'processing',
          progress: task.progress || 0,
        };
      }
    } catch (err) {
      const error = err as AxiosError;
      console.error('❌ [checkStatus] Error status:', error.response?.status);
      console.error('❌ [checkStatus] Error data:', JSON.stringify(error.response?.data, null, 2));
      console.error('❌ [checkStatus] Error message:', error.message);
      throw new InternalServerErrorException('Failed to check task status');
    }
  }
}