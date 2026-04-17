import { Module } from '@nestjs/common';
import { ConvertModule } from './convert/convert.module';
import { ProxyController } from './proxy/proxy.controller';

@Module({
  imports: [ConvertModule],
  controllers: [ProxyController],
})
export class AppModule {}
