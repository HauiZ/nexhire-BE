import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class JobClient {
  private readonly logger = new Logger(JobClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getActiveJobsByCompany(companyId: string): Promise<any[]> {
    // Lấy URL của job-service từ biến môi trường (Ví dụ: 'http://localhost:3002')
    // Fallback về port mặc định theo Rule nếu chưa setup env
    const jobServiceUrl = this.config.get<string>('auth.jobServiceUrl', 'http://localhost:3002');
    
    // Đường dẫn giả định bên job-service: GET /api/v1/jobs?companyId=...&status=OPEN
    const url = `${jobServiceUrl}/api/v1/jobs`;

    try {
      const { data } = await firstValueFrom(
        this.http.get(url, {
          params: { companyId, status: 'OPEN' }, // Lọc job đang mở của công ty này
          timeout: 5000, // Rule 12: Bắt buộc set timeout (5s)
        }),
      );

      // Rule 09: Dự án có ResponseInterceptor trả về dạng { success: true, data: [...] }
      // Nên ta phải lấy data.data
      return data.data || [];
    } catch (error : unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to fetch jobs for company ${companyId}: ${errorMessage}`);
      
      // Rule 09 & 12: Catch lỗi HTTP và ném ra HttpException chuẩn để trả về cho Frontend
      throw new ServiceUnavailableException('Job service is temporarily unavailable');
    }
  }
}