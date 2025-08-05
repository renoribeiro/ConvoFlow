// Shared validation utilities for Supabase Edge Functions

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Basic validation schemas
export const ValidationSchemas = {
  phoneNumber: {
    pattern: /^\+?[1-9]\d{1,14}$/,
    message: 'Invalid phone number format'
  },
  instanceName: {
    pattern: /^[a-zA-Z0-9_-]{1,50}$/,
    message: 'Invalid instance name'
  },
  tenantId: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    message: 'Invalid tenant ID format'
  },
  messageContent: {
    maxLength: 4096,
    message: 'Message content too long'
  }
};

// Validation functions
export function validatePhoneNumber(phone: string): ValidationResult<string> {
  if (!phone || typeof phone !== 'string') {
    return { success: false, error: 'Phone number is required' };
  }
  
  const cleaned = phone.replace(/\s+/g, '').replace(/[()\-]/g, '');
  
  if (!ValidationSchemas.phoneNumber.pattern.test(cleaned)) {
    return { success: false, error: ValidationSchemas.phoneNumber.message };
  }
  
  return { success: true, data: cleaned };
}

export function validateInstanceName(name: string): ValidationResult<string> {
  if (!name || typeof name !== 'string') {
    return { success: false, error: 'Instance name is required' };
  }
  
  if (!ValidationSchemas.instanceName.pattern.test(name)) {
    return { success: false, error: ValidationSchemas.instanceName.message };
  }
  
  return { success: true, data: name };
}

export function validateTenantId(tenantId: string): ValidationResult<string> {
  if (!tenantId || typeof tenantId !== 'string') {
    return { success: false, error: 'Tenant ID is required' };
  }
  
  if (!ValidationSchemas.tenantId.pattern.test(tenantId)) {
    return { success: false, error: ValidationSchemas.tenantId.message };
  }
  
  return { success: true, data: tenantId };
}

export function validateMessageContent(content: string): ValidationResult<string> {
  if (!content || typeof content !== 'string') {
    return { success: false, error: 'Message content is required' };
  }
  
  if (content.length > ValidationSchemas.messageContent.maxLength) {
    return { success: false, error: ValidationSchemas.messageContent.message };
  }
  
  // Basic sanitization - remove potential script tags and dangerous patterns
  const sanitized = content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
  
  return { success: true, data: sanitized };
}

// Sanitization utilities
export class DataSanitizer {
  static sanitizeForLog(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }
    
    const sensitiveKeys = ['apikey', 'password', 'token', 'secret', 'key'];
    const sanitized = { ...data };
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '***';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeForLog(sanitized[key]);
      }
    }
    
    return sanitized;
  }
  
  static sanitizePhoneNumber(phone: string): string {
    return phone.replace(/[^+\d]/g, '');
  }
}

// Error handling utilities
export class SecureError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  
  constructor(message: string, code: string = 'VALIDATION_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'SecureError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function createErrorResponse(error: SecureError | Error, requestId?: string): Response {
  const isSecureError = error instanceof SecureError;
  const statusCode = isSecureError ? error.statusCode : 500;
  const code = isSecureError ? error.code : 'INTERNAL_ERROR';
  
  const responseBody = {
    error: {
      message: error.message,
      code,
      requestId
    }
  };
  
  return new Response(JSON.stringify(responseBody), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

// CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};