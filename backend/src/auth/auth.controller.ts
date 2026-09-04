import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { loginSchema } from './login.schema.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: unknown) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.login(parsed.data);
  }
}
