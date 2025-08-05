/**
 * Secure logging utility
 * Provides structured logging with security considerations
 */

import { env } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: Error;
}

class SecureLogger {
  private sensitiveKeys = [
    'password', 'token', 'key', 'secret', 'apikey', 'api_key',
    'authorization', 'auth', 'credential', 'private', 'confidential'
  ];

  private shouldLog(level: LogLevel): boolean {
    if (env.isProduction() && level === 'debug') {
      return false;
    }
    
    if (!env.isConsoleLogsEnabled() && (level === 'debug' || level === 'info')) {
      return false;
    }

    return true;
  }

  private sanitizeData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.sensitiveKeys.some(sensitiveKey => 
        lowerKey.includes(sensitiveKey)
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private formatMessage(entry: LogEntry): string {
    const { level, message, timestamp, context, error } = entry;
    
    let formatted = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (context && Object.keys(context).length > 0) {
      const sanitizedContext = this.sanitizeData(context);
      formatted += ` | Context: ${JSON.stringify(sanitizedContext)}`;
    }
    
    if (error) {
      formatted += ` | Error: ${error.message}`;
      if (env.isDevelopment() && error.stack) {
        formatted += ` | Stack: ${error.stack}`;
      }
    }
    
    return formatted;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: context ? this.sanitizeData(context) : undefined,
      error
    };

    const formattedMessage = this.formatMessage(entry);

    // Use appropriate console method based on level
    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }

    // In production, you might want to send logs to a service
    if (env.isProduction() && (level === 'error' || level === 'warn')) {
      this.sendToLogService(entry);
    }
  }

  private async sendToLogService(entry: LogEntry): Promise<void> {
    // TODO: Implement log service integration (e.g., Sentry, LogRocket, etc.)
    // This is where you would send critical logs to your monitoring service
    try {
      // Example: await logService.send(entry);
    } catch (error) {
      // Fallback to console if log service fails
      console.error('Failed to send log to service:', error);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, any>, error?: Error): void {
    this.log('error', message, context, error);
  }

  // Convenience method for API errors
  apiError(endpoint: string, error: Error, context?: Record<string, any>): void {
    this.error(`API Error at ${endpoint}`, {
      endpoint,
      ...context
    }, error);
  }

  // Convenience method for authentication errors
  authError(message: string, context?: Record<string, any>): void {
    this.error(`Auth Error: ${message}`, context);
  }
}

// Singleton instance
export const logger = new SecureLogger();

// Export types
export type { LogLevel, LogEntry };