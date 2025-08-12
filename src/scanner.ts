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
    const validation: ValidationSchema = { type: 'zod' };
    
    // Find the method definition after the decorator
    const afterDecorator = content.slice(startIndex);
    const methodMatch = afterDecorator.match(/async\s+(\w+)\s*\([^)]*\)/);
    if (!methodMatch) return undefined;
    
    const methodName = methodMatch[1];
    const methodStartIndex = startIndex + afterDecorator.indexOf(methodMatch[0]);
    
    // Look backwards from method to find its decorators
    const beforeMethod = content.slice(Math.max(0, startIndex - 1000), methodStartIndex);
    const lines = beforeMethod.split('\n');
    
    // Find decorators for this specific method (work backwards from method)
    let foundUseBefore = false;
    let foundBody = false;
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      
      // Stop if we hit another method or class definition
      if (line.includes('async ') && !line.includes(methodName)) break;
      if (line.includes('class ')) break;
      
      // Look for @UseBefore
      if (!foundUseBefore && line.includes('@UseBefore')) {
        const useBeforeMatch = line.match(/@UseBefore\(RequestValidatorMiddleware\.validate\((\w+)\)/);
        if (useBeforeMatch) {
          const schemaName = useBeforeMatch[1];
          const schema = this.resolveSchema(schemaName, content, imports, filePath);
          if (schema) {
            validation.body = schema.body;
            validation.properties = schema.properties;
            foundUseBefore = true;
          }
        }
      }
    }
    
    // Extract @Body() parameter type from method signature
    if (!foundBody) {
      const methodSignature = content.slice(methodStartIndex, methodStartIndex + 500);
      const bodyParamMatch = methodSignature.match(/@Body\(\)\s+\w+:\s*(\w+)/);
      if (bodyParamMatch) {
        const dtoName = bodyParamMatch[1];
        const schema = this.resolveSchema(dtoName, content, imports, filePath);
        if (schema && !validation.body) {
          validation.body = schema.body;
          validation.properties = schema.properties;
        }
      }
    }
    
    // Extract response type from method signature
    const methodSignature = content.slice(methodStartIndex, methodStartIndex + 500);
    const responseType = this.extractResponseType(methodSignature);
    if (responseType) {
      const schema = this.resolveSchema(responseType, content, imports, filePath);
      if (schema) {
        validation.responses = { '200': schema.body };
      }
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
    
    // Try TypeScript interface/type definition
    if (!schema) {
      schema = this.findTypeScriptInterface(content, schemaName);
      
      // Try imported TypeScript types
      if (!schema && imports.has(schemaName)) {
        const importPath = imports.get(schemaName)!;
        schema = this.loadExternalTypeScriptInterface(schemaName, importPath, filePath);
      }
    }
    
    // If no direct match, try schema variant (UserResponse -> UserResponseSchema)
    if (!schema && !schemaName.endsWith('Schema')) {
      const schemaVariant = schemaName + 'Schema';
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
    // Find schema definition with better parsing - handle multiline
    const lines = content.split('\n');
    let schemaStartLine = -1;
    let schemaType: 'zod' | 'joi' | 'class-validator' = 'zod';
    
    // Find the line where schema starts
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`const ${schemaName} =`) || lines[i].includes(`export const ${schemaName} =`)) {
        schemaStartLine = i;
        if (lines[i].includes('z.object') || content.slice(content.indexOf(lines[i])).includes('z.object')) {
          schemaType = 'zod';
        } else if (lines[i].includes('Joi.object') || content.slice(content.indexOf(lines[i])).includes('Joi.object')) {
          schemaType = 'joi';
        }
        break;
      }
    }
    
    if (schemaStartLine === -1) {
      // Try class definition
      return this.findClassDefinition(content, schemaName);
    }
    
    // Extract the complete schema definition
    let schemaLines = [];
    let braceCount = 0;
    let parenCount = 0;
    let foundStart = false;
    
    for (let i = schemaStartLine; i < lines.length; i++) {
      const line = lines[i];
      schemaLines.push(line);
      
      // Count braces and parentheses
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundStart = true;
        } else if (char === '}') {
          braceCount--;
        } else if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
        }
      }
      
      // Stop when we've closed all braces and parentheses, or hit a semicolon
      if (foundStart && braceCount === 0 && parenCount === 0) {
        break;
      }
      if (line.trim().endsWith(';')) {
        break;
      }
    }
    
    const schemaDefinition = schemaLines.join('\n');
    
    // Parse the schema to extract properties with descriptions
    const properties = this.parseSchemaProperties(schemaDefinition, schemaType);
    
    return {
      type: schemaType,
      body: schemaDefinition,
      properties
    };
  }
  
  private findClassDefinition(content: string, className: string): ValidationSchema | undefined {
    const classRegex = new RegExp(`export\s+class\s+${className}[\s\S]*?\{([\s\S]*?)\n\}`, 'm');
    const match = classRegex.exec(content);
    
    if (!match) return undefined;
    
    const classBody = match[1];
    const properties = this.parseClassProperties(classBody);
    
    return {
      type: 'class-validator',
      body: match[0],
      properties
    };
  }
  
  private parseSchemaProperties(schemaDefinition: string, type: 'zod' | 'joi'): any {
    const properties: any = {};
    
    // Extract object content
    const objectMatch = schemaDefinition.match(/(?:z|Joi)\.object\(\{([\s\S]*?)\}\)/);
    if (!objectMatch) return properties;
    
    const objectContent = objectMatch[1];
    
    // Parse each property
    const propertyRegex = /\/\*\*\s*([^*]+)\s*\*\/\s*([\w]+):\s*([^,}]+)/g;
    let propMatch;
    
    while ((propMatch = propertyRegex.exec(objectContent)) !== null) {
      const [, description, propName, propDefinition] = propMatch;
      
      properties[propName] = {
        description: description.trim(),
        definition: propDefinition.trim(),
        type: this.inferTypeFromDefinition(propDefinition, type)
      };
    }
    
    // Also parse properties without JSDoc comments
    const simplePropertyRegex = /([\w]+):\s*([^,}]+)/g;
    let simplePropMatch;
    
    while ((simplePropMatch = simplePropertyRegex.exec(objectContent)) !== null) {
      const [, propName, propDefinition] = simplePropMatch;
      
      if (!properties[propName]) {
        // Extract description from .describe() calls
        const describeMatch = propDefinition.match(/\.describe\(['"`]([^'"`]+)['"`]\)/);
        const description = describeMatch ? describeMatch[1] : '';
        
        properties[propName] = {
          description,
          definition: propDefinition.trim(),
          type: this.inferTypeFromDefinition(propDefinition, type)
        };
      }
    }
    
    return properties;
  }
  
  private parseClassProperties(classBody: string): any {
    const properties: any = {};
    
    // Parse class properties with decorators
    const propertyRegex = /\/\*\*\s*([^*]+)\s*\*\/[\s\S]*?@[\w\(\)\s,]*\s*([\w]+):\s*([^;]+)/g;
    let match;
    
    while ((match = propertyRegex.exec(classBody)) !== null) {
      const [, description, propName, propType] = match;
      
      properties[propName] = {
        description: description.trim(),
        type: propType.trim(),
        decorators: this.extractDecorators(classBody, propName)
      };
    }
    
    return properties;
  }
  
  private extractDecorators(classBody: string, propName: string): string[] {
    const decorators: string[] = [];
    const lines = classBody.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`${propName}:`)) {
        // Look backwards for decorators
        for (let j = i - 1; j >= 0; j--) {
          const line = lines[j].trim();
          if (line.startsWith('@')) {
            decorators.unshift(line);
          } else if (line && !line.startsWith('/**') && !line.includes('*/')) {
            break;
          }
        }
        break;
      }
    }
    
    return decorators;
  }
  
  private findTypeScriptInterface(content: string, interfaceName: string): ValidationSchema | undefined {
    // Find interface or type definition
    const interfaceRegex = new RegExp(`(?:export\s+)?(?:interface|type)\s+${interfaceName}\s*[={]([\s\S]*?)\n}`, 'm');
    const match = interfaceRegex.exec(content);
    
    if (!match) return undefined;
    
    const interfaceBody = match[1];
    const properties = this.parseTypeScriptInterface(interfaceBody);
    
    return {
      type: 'zod', // Use zod as default type for interfaces
      body: match[0],
      properties
    };
  }
  
  private parseTypeScriptInterface(interfaceBody: string): any {
    const properties: any = {};
    
    // Parse interface properties with JSDoc comments
    const lines = interfaceBody.split('\n');
    let currentComment = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Capture JSDoc comment
      if (line.startsWith('/**')) {
        currentComment = line.replace(/\/\*\*\s*/, '').replace(/\s*\*\//, '').trim();
        continue;
      }
      
      // Parse property definition
      const propMatch = line.match(/^([\w]+)(\?)?:\s*([^;,]+)/);
      if (propMatch) {
        const [, propName, optional, propType] = propMatch;
        
        properties[propName] = {
          description: currentComment || '',
          type: this.mapTypeScriptTypeToSwagger(propType.trim()),
          required: !optional,
          tsType: propType.trim()
        };
        
        currentComment = ''; // Reset comment
      }
    }
    
    return properties;
  }
  
  private mapTypeScriptTypeToSwagger(tsType: string): string {
    // Map TypeScript types to Swagger types
    if (tsType === 'string') return 'string';
    if (tsType === 'number') return 'number';
    if (tsType === 'boolean') return 'boolean';
    if (tsType.startsWith('string[]') || tsType.startsWith('Array<string>')) return 'array';
    if (tsType.startsWith('number[]') || tsType.startsWith('Array<number>')) return 'array';
    if (tsType.includes('[]') || tsType.startsWith('Array<')) return 'array';
    if (tsType.includes('{') || tsType.includes('|')) return 'object';
    
    // Default to string for unknown types
    return 'string';
  }
  
  private loadExternalTypeScriptInterface(interfaceName: string, importPath: string, currentFilePath: string): ValidationSchema | undefined {
    try {
      const resolvedPath = path.resolve(path.dirname(currentFilePath), importPath + '.ts');
      if (!fs.existsSync(resolvedPath)) {
        return undefined;
      }
      
      const externalContent = fs.readFileSync(resolvedPath, 'utf-8');
      return this.findTypeScriptInterface(externalContent, interfaceName);
    } catch {
      return undefined;
    }
  }
  
  private inferTypeFromDefinition(definition: string, schemaType: 'zod' | 'joi'): string {
    if (schemaType === 'zod') {
      if (definition.includes('z.string')) return 'string';
      if (definition.includes('z.number')) return 'number';
      if (definition.includes('z.boolean')) return 'boolean';
      if (definition.includes('z.array')) return 'array';
      if (definition.includes('z.object')) return 'object';
    } else {
      if (definition.includes('Joi.string')) return 'string';
      if (definition.includes('Joi.number')) return 'number';
      if (definition.includes('Joi.boolean')) return 'boolean';
      if (definition.includes('Joi.array')) return 'array';
      if (definition.includes('Joi.object')) return 'object';
    }
    
    return 'string';
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