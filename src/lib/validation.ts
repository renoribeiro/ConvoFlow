/**
 * Input validation and sanitization utilities
 * Provides security-focused validation functions
 */

import { z } from 'zod';

// Common validation schemas
export const ValidationSchemas = {
  // URL validation
  url: z.string().url('URL inválida').min(1, 'URL é obrigatória'),
  
  // API Key validation
  apiKey: z.string()
    .min(10, 'Chave API deve ter pelo menos 10 caracteres')
    .max(500, 'Chave API muito longa')
    .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Chave API contém caracteres inválidos'),
  
  // Phone number validation
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Número de telefone inválido')
    .min(8, 'Número muito curto')
    .max(15, 'Número muito longo'),
  
  // Email validation
  email: z.string().email('Email inválido'),
  
  // Password validation
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(128, 'Senha muito longa')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Senha deve conter ao menos uma letra minúscula, maiúscula e um número'),
  
  // Instance name validation
  instanceName: z.string()
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(50, 'Nome muito longo')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Nome pode conter apenas letras, números, _ e -'),
  
  // Message content validation
  messageContent: z.string()
    .min(1, 'Mensagem não pode estar vazia')
    .max(4096, 'Mensagem muito longa'),
  
  // Webhook URL validation
  webhookUrl: z.string().url('URL do webhook inválida').optional(),
  
  // Tenant ID validation
  tenantId: z.string().uuid('ID do tenant inválido'),
  
  // Contact name validation
  contactName: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome muito longo')
    .regex(/^[\p{L}\p{N}\s\-\.]+$/u, 'Nome contém caracteres inválidos'),
};

// HTML sanitization
export class HtmlSanitizer {
  private static readonly ALLOWED_TAGS = ['b', 'i', 'u', 'strong', 'em', 'br', 'p'];
  private static readonly DANGEROUS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick, onload, etc.
  ];

  static sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Remove dangerous patterns
    this.DANGEROUS_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Remove all HTML tags except allowed ones
    const allowedTagsRegex = new RegExp(
      `<(?!\/?(?:${this.ALLOWED_TAGS.join('|')})\b)[^>]*>`,
      'gi'
    );
    sanitized = sanitized.replace(allowedTagsRegex, '');

    // Encode remaining special characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    return sanitized.trim();
  }

  static stripHtml(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/<[^>]*>/g, '') // Remove all HTML tags
      .replace(/&\w+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

// SQL injection prevention
export class SqlSanitizer {
  private static readonly SQL_INJECTION_PATTERNS = [
    /('|(\-\-)|(;)|(\||\|)|(\*|\*))/gi,
    /(exec(\s|\+)+(s|x)p\w+)/gi,
    /union[\s\w]*select/gi,
    /select[\s\w]*from/gi,
    /insert[\s\w]*into/gi,
    /delete[\s\w]*from/gi,
    /update[\s\w]*set/gi,
    /drop[\s\w]*table/gi,
    /create[\s\w]*table/gi,
    /alter[\s\w]*table/gi,
  ];

  static containsSqlInjection(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    return this.SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
  }

  static sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Remove potential SQL injection patterns
    let sanitized = input;
    this.SQL_INJECTION_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized.trim();
  }
}

// URL validation and sanitization
export class UrlSanitizer {
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];
  private static readonly DANGEROUS_DOMAINS = [
    'javascript',
    'data',
    'vbscript',
    'file',
    'ftp'
  ];

  static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.ALLOWED_PROTOCOLS.includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  static sanitizeUrl(url: string): string | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    try {
      const parsed = new URL(url);
      
      // Check protocol
      if (!this.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return null;
      }

      // Check for dangerous domains
      if (this.DANGEROUS_DOMAINS.some(domain => 
        parsed.hostname.toLowerCase().includes(domain)
      )) {
        return null;
      }

      return parsed.toString();
    } catch {
      return null;
    }
  }
}

// General input sanitizer
export class InputSanitizer {
  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .slice(0, maxLength)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .trim();
  }

  static sanitizePhoneNumber(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      return '';
    }

    return phone
      .replace(/[^\d+\-\s()]/g, '') // Keep only digits, +, -, spaces, parentheses
      .trim();
  }

  static sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }

    return email
      .toLowerCase()
      .replace(/[^a-z0-9@._\-]/g, '') // Keep only valid email characters
      .trim();
  }
}

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Generic validation function
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  try {
    const data = schema.parse(input);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors.map(e => e.message).join(', ')
      };
    }
    return {
      success: false,
      error: 'Erro de validação desconhecido'
    };
  }
}