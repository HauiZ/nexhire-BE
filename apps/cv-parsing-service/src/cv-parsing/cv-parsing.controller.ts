import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CvParsingService } from './cv-parsing.service';

@ApiTags('cv-parsing')
@Controller('cv-parsing')
export class CvParsingController {
  constructor(private readonly cvParsingService: CvParsingService) {}
}
