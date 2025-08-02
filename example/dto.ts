import { IsEmail, IsString, IsNumber, Min, IsOptional, IsArray } from 'class-validator';

export class CreateUserDto {
  /** User's full name */
  @IsString()
  name: string; // Full name of the user

  @IsEmail()
  email: string; // Valid email address

  @IsNumber()
  @Min(18)
  age: number; // Age must be 18 or older
}

export class UpdateUserDto {
  /** Updated user name */
  @IsOptional()
  @IsString()
  name?: string; // Optional name update

  @IsOptional()
  @IsEmail()
  email?: string; // Optional email update
}

export class CreatePostDto {
  /** Post title */
  @IsString()
  title: string; // Title of the post

  @IsString()
  content: string; // Main content

  @IsOptional()
  @IsArray()
  tags?: string[]; // Optional tags array
}