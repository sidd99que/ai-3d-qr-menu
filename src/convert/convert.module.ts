import { Module } from '@nestjs/common';
import { ConvertController } from './convert.controller';
import { ConvertService } from './convert.service';
import { TripoService } from './tripo.service';

@Module({
  controllers: [ConvertController],
  providers: [ConvertService, TripoService],
})
export class ConvertModule {}