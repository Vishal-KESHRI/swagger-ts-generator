import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { RouteInfo, ValidationSchema } from './types';

export class ProjectScanner {
  private routes: RouteInfo[] = [];

  async scanProject(scanPaths: string[]): Promise<RouteInfo[]> {
    this.routes = [];
    
    for (const scanPath of scanPaths) {
      const files = await glob(`${scanPath}/**/*.{ts,js}`, { ignore: ['**/node_modules/**', '**/dist/**'] });
      
      for (const file of files) {
        await this.scanFile(file);
      }
    }
    
    return this.routes;
  }

  async generateSwagger(config: any): Promise<void> {
    const routes = await this.scanProject(config.scanPaths);
    const generator = new (await import('./generator')).SwaggerGenerator();
    const spec = generator.generate(config, routes);
    
    const fs = await import('fs');
    fs.writeFileSync(config.outputPath, JSON.stringify(spec, null, 2));
  }

  private async scanFile(filePath: string): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Extract imports to find external schemas
    const imports = this.extractImports(content);
    
    // Scan for Express routes
    this.scanExpressRoutes(content, filePath, imports);
    
    // Scan for Fastify routes
    this.scanFastifyRoutes(content, filePath, imports);
    
    // Scan for decorators (NestJS style)
    this.scanDecorators(content, filePath, imports);
  }

  private scanExpressRoutes(content: string, filePath: string, imports: Map<string, string>): void {
    const routeRegex = /(?:router|app)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([^,)]+)(?:,\s*([^)]+))?\)/g;
    let match;

    while ((match = routeRegex.exec(content)) !== null) {
      const [fullMatch, method, routePath, middleware, handler] = match;
      
      // Extract validation from middleware and imports
      const validation = this.extractValidationFromMiddleware(content, middleware || '', imports, filePath);
      
      this.routes.push({
        method: method.toUpperCase(),
        path: routePath,
        handler: (handler || middleware || '').trim(),
        validation
      });
    }
  }

  private scanFastifyRoutes(content: string, filePath: string, imports: Map<string, string>): void {
    const routeRegex = /fastify\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*({[^}]*})?/g;
    let match;

    while ((match = routeRegex.exec(content)) !== null) {
      const [, method, routePath, options] = match;
      
      const validation = this.extractValidation(content, match.index, imports, filePath);
      
      this.routes.push({
        method: method.toUpperCase(),
        path: routePath,
        handler: 'fastify handler',
        validation
      });
    }
  }

  private scanDecorators(content: string, filePath: string, imports: Map<string, string>): void {
    // Find @JsonController base path
    const controllerMatch = content.match(/@JsonController\(['"`]([^'"`]*)['"`]\)/);
    const basePath = controllerMatch ? controllerMatch[1] : '';
    
    // Scan for method decorators
    const decoratorRegex = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]?([^'"`\)]*?)['"`]?\s*\)/g;
    let match;

    while ((match = decoratorRegex.exec(content)) !== null) {
      const [, method, routePath] = match;
      const fullPath = basePath + (routePath || '');
      
      // Look for @UseBefore validation middleware
      const validation = this.extractUseBefore(content, match.index, imports, filePath);
      
      this.routes.push({
        method: method.toUpperCase(),
        path: fullPath,
        handler: 'controller method',
        validation
      });
    }
  }

  private extractValidationFromMiddleware(content: string, middleware: string, imports: Map<string, string>, filePath: string): ValidationSchema | undefined {
    // Check if middleware directly references a schema or DTO
    const schemaMatch = middleware.match(/(\w+(?:Schema|Dto))/);
    if (!schemaMatch) return undefined;
    
    const schemaName = schemaMatch[1];
    
    // First try to find in current file
    let validation = this.findSchemaDefinition(content, schemaName);
    
    // If not found and schema is imported, look in external file
    if (!validation && imports.has(schemaName)) {
      const importPath = imports.get(schemaName)!;
      validation = this.loadExternalSchemaSync(schemaName, importPath, filePath);
    }
    
    return validation;
  }

  private extractUseBefore(content: string, startIndex: number, imports: Map<string, string>, filePath: string): ValidationSchema | undefined {
    // Look for @UseBefore with RequestValidatorMiddleware
    const contextWindow = content.slice(startIndex, startIndex + 1500);
    const useBeforeMatch = contextWindow.match(/@UseBefore\([\s\S]*?RequestValidatorMiddleware\(\{([\s\S]*?)\}\)[\s\S]*?\)/);
    
    const validation: ValidationSchema = { type: 'zod' };
    
    if (useBeforeMatch) {
      const validationConfig = useBeforeMatch[1];
      
      // Extract query, headers, body, response schemas
      const queryMatch = validationConfig.match(/query:\s*(\w+)/);
      const headersMatch = validationConfig.match(/headers:\s*(\w+)/);
      const bodyMatch = validationConfig.match(/body:\s*(\w+)/);
      const responseMatch = validationConfig.match(/response:\s*(\w+)/);
      
      if (queryMatch) {
        const schema = this.resolveSchema(queryMatch[1], content, imports, filePath);
        if (schema) validation.query = schema.body;
      }
      
      if (headersMatch) {
        const schema = this.resolveSchema(headersMatch[1], content, imports, filePath);
        if (schema) validation.headers = schema.body;
      }
      
      if (bodyMatch) {
        const schema = this.resolveSchema(bodyMatch[1], content, imports, filePath);
        if (schema) validation.body = schema.body;
      }
      
      if (responseMatch) {
        const schema = this.resolveSchema(responseMatch[1], content, imports, filePath);
        if (schema) validation.responses = { '200': schema.body };
      }
    }
    
    // Extract response type from method signature
    const responseType = this.extractResponseType(contextWindow);
    if (responseType && !validation.responses) {
      const schema = this.resolveSchema(responseType, content, imports, filePath);
      if (schema) validation.responses = { '200': schema.body };
    }
    
    return Object.keys(validation).length > 1 ? validation : undefined;
  }

  private extractResponseType(methodContext: string): string | undefined {
    // Extract from Promise<express.Response<TUserResponse>>
    const expressResponseMatch = methodContext.match(/Promise<[^<]*Response<(\w+)>>/);
    if (expressResponseMatch) return expressResponseMatch[1];
    
    // Extract from Promise<TUserResponse>
    const promiseMatch = methodContext.match(/Promise<(T\w+)>/);
    if (promiseMatch) return promiseMatch[1];
    
    // Extract from : TUserResponse
    const directTypeMatch = methodContext.match(/:\s*(T\w+)\s*\{/);
    if (directTypeMatch) return directTypeMatch[1];
    
    return undefined;
  }

  private resolveSchema(schemaName: string, content: string, imports: Map<string, string>, filePath: string): ValidationSchema | undefined {
    // Try current file first
    let schema = this.findSchemaDefinition(content, schemaName);
    
    // Try imported files
    if (!schema && imports.has(schemaName)) {
      const importPath = imports.get(schemaName)!;
      schema = this.loadExternalSchemaSync(schemaName, importPath, filePath);
    }
    
    // If it's a TypeScript type (starts with T), try to find corresponding schema
    if (!schema && schemaName.startsWith('T')) {
      const schemaVariant = schemaName.replace(/^T/, '') + 'Schema';
      schema = this.findSchemaDefinition(content, schemaVariant);
      
      if (!schema && imports.has(schemaVariant)) {
        const importPath = imports.get(schemaVariant)!;
        schema = this.loadExternalSchemaSync(schemaVariant, importPath, filePath);
      }
    }
    
    return schema;
  }

  private loadExternalSchemaSync(schemaName: string, importPath: string, currentFilePath: string): ValidationSchema | undefined {
    try {
      const resolvedPath = path.resolve(path.dirname(currentFilePath), importPath + '.ts');
      if (!fs.existsSync(resolvedPath)) {
        return undefined;
      }
      
      const externalContent = fs.readFileSync(resolvedPath, 'utf-8');
      return this.findSchemaDefinition(externalContent, schemaName);
    } catch {
      return undefined;
    }
  }

  private findSchemaDefinition(content: string, schemaName: string): ValidationSchema | undefined {
    // Simple approach: find the schema definition and extract until the closing bracket
    const lines = content.split('\n');
    let schemaStartLine = -1;
    let schemaType: 'zod' | 'joi' | 'class-validator' | null = null;
    
    // Find the line where schema is defined
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`const ${schemaName} =`)) {
        schemaStartLine = i;
        if (lines[i].includes('z.object')) {
          schemaType = 'zod';
        } else if (lines[i].includes('Joi.object')) {
          schemaType = 'joi';
        }
        break;
      } else if (lines[i].includes(`class ${schemaName}`)) {
        schemaStartLine = i;
        schemaType = 'class-validator';
        break;
      }
    }
    
    if (schemaStartLine === -1 || !schemaType) return undefined;
    
    // Handle class-validator differently
    if (schemaType === 'class-validator') {
      return this.extractClassValidation(content, schemaStartLine, lines);
    }
    
    // Extract the schema definition
    let schemaLines = [];
    let braceCount = 0;
    let foundOpenBrace = false;
    
    for (let i = schemaStartLine; i < lines.length; i++) {
      const line = lines[i];
      schemaLines.push(line);
      
      // Count braces
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
        }
      }
      
      // If we've closed all braces and found at least one, we're done
      if (foundOpenBrace && braceCount === 0) {
        break;
      }
    }
    
    const schemaText = schemaLines.join('\n');
    // Extract the complete object definition
    let objectStart = -1;
    let objectEnd = -1;
    
    if (schemaType === 'zod') {
      objectStart = schemaText.indexOf('z.object(');
    } else {
      objectStart = schemaText.indexOf('Joi.object(');
    }
    
    if (objectStart !== -1) {
      // Find the matching closing parenthesis
      let parenCount = 0;
      let i = objectStart;
      
      // Find the opening parenthesis
      while (i < schemaText.length && schemaText[i] !== '(') i++;
      if (i < schemaText.length) {
        parenCount = 1;
        i++;
        
        while (i < schemaText.length && parenCount > 0) {
          if (schemaText[i] === '(') parenCount++;
          else if (schemaText[i] === ')') parenCount--;
          i++;
        }
        
        if (parenCount === 0) {
          objectEnd = i;
          const objectDef = schemaText.slice(objectStart, objectEnd);
          return { type: schemaType, body: objectDef };
        }
      }
    }
    
    return undefined;
  }

  private extractValidation(content: string, startIndex: number, imports: Map<string, string>, filePath: string): ValidationSchema | undefined {
    const contextWindow = content.slice(Math.max(0, startIndex - 1000), startIndex + 1000);
    
    // Extract schema variable names used in routes
    const schemaVarMatch = contextWindow.match(/(\w+Schema)/);
    if (!schemaVarMatch) return undefined;
    
    const schemaName = schemaVarMatch[1];
    
    // First try current file
    let validation = this.findSchemaDefinition(content, schemaName);
    
    // If not found and imported, try external file
    if (!validation && imports.has(schemaName)) {
      const importPath = imports.get(schemaName)!;
      validation = this.loadExternalSchemaSync(schemaName, importPath, filePath);
    }
    
    return validation;
  }

  private extractClassValidation(content: string, startLine: number, lines: string[]): ValidationSchema {
    let classLines = [];
    let braceCount = 0;
    let foundOpenBrace = false;
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      classLines.push(line);
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
        }
      }
      
      if (foundOpenBrace && braceCount === 0) {
        break;
      }
    }
    
    return { type: 'class-validator', body: classLines.join('\n') };
  }

  private extractImports(content: string): Map<string, string> {
    const imports = new Map<string, string>();
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const [, importedItems, filePath] = match;
      const items = importedItems.split(',').map(item => item.trim());
      
      items.forEach(item => {
        imports.set(item, filePath);
      });
    }

    return imports;
  }

  private async loadExternalSchema(schemaName: string, importPath: string, currentFilePath: string): Promise<ValidationSchema | undefined> {
    try {
      const resolvedPath = path.resolve(path.dirname(currentFilePath), importPath + '.ts');
      if (!fs.existsSync(resolvedPath)) {
        return undefined;
      }
      
      const externalContent = fs.readFileSync(resolvedPath, 'utf-8');
      return this.findSchemaDefinition(externalContent, schemaName);
    } catch {
      return undefined;
    }
  }
}