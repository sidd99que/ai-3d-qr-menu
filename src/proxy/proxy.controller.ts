import { Controller, Get, Query, Res, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import axios from 'axios';

@Controller()
export class ProxyController {

  @Get('proxy-model')
  async proxyModel(
    @Query('url') url: string,
    @Res() res: Response,
  ) {
    console.log('🔗 Proxy received URL length:', url?.length);
    console.log('🔗 Proxy received URL:', url);

    if (!url) {
      throw new HttpException('Missing url parameter', HttpStatus.BAD_REQUEST);
    }

    if (!url.startsWith('https://tripo-data.rg1.data.tripo3d.com/')) {
      throw new HttpException('Invalid or unauthorized URL', HttpStatus.FORBIDDEN);
    }

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
        maxRedirects: 5,
      });

      console.log('✅ Proxy fetch success, status:', response.status);
      console.log('✅ Content length:', response.data?.byteLength);

      res.set({
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      });

      res.send(Buffer.from(response.data));

    } catch (error: any) {
      console.error('❌ Proxy error status:', error.response?.status);
      console.error('❌ Proxy error message:', error.message);
      console.error('❌ Proxy error data:', error.response?.data?.toString());
      throw new HttpException('Failed to proxy 3D model', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}