/**
 * Environment variables utility
 * Provides type-safe access to environment variables
 */

interface EnvConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_API_KEY?: string;
  APP_NAME: string;
  APP_VERSION: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  ENABLE_DEBUG_LOGS: boolean;
  ENABLE_CONSOLE_LOGS: boolean;
  TRACKING_DOMAIN: string;
}

class EnvironmentManager {
  private config: EnvConfig;

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  private loadConfig(): EnvConfig {
    return {
      SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || 'https://pqjkuwyshybxldzpfbbs.supabase.co',
      SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0',
      EVOLUTION_API_URL: import.meta.env.VITE_EVOLUTION_API_URL,
      EVOLUTION_API_KEY: import.meta.env.VITE_EVOLUTION_API_KEY,
      APP_NAME: import.meta.env.VITE_APP_NAME || 'ConvoFlow',
      APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
      ENVIRONMENT: (import.meta.env.VITE_ENVIRONMENT as EnvConfig['ENVIRONMENT']) || 'development',
      ENABLE_DEBUG_LOGS: import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true',
      ENABLE_CONSOLE_LOGS: import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true' || import.meta.env.DEV,
      TRACKING_DOMAIN: import.meta.env.VITE_TRACKING_DOMAIN || 'track.convoflow.com',
    };
  }

  private validateConfig(): void {
    const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'] as const;
    
    for (const key of required) {
      if (!this.config[key]) {
        throw new Error(`Missing required environment variable: VITE_${key}`);
      }
    }

    // Validate URL format
    try {
      new URL(this.config.SUPABASE_URL);
    } catch {
      throw new Error('Invalid SUPABASE_URL format');
    }

    if (this.config.EVOLUTION_API_URL) {
      try {
        new URL(this.config.EVOLUTION_API_URL);
      } catch {
        throw new Error('Invalid EVOLUTION_API_URL format');
      }
    }
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  getAll(): Readonly<EnvConfig> {
    return Object.freeze({ ...this.config });
  }

  isDevelopment(): boolean {
    return this.config.ENVIRONMENT === 'development';
  }

  isProduction(): boolean {
    return this.config.ENVIRONMENT === 'production';
  }

  isDebugEnabled(): boolean {
    return this.config.ENABLE_DEBUG_LOGS;
  }

  isConsoleLogsEnabled(): boolean {
    return this.config.ENABLE_CONSOLE_LOGS;
  }
}

// Singleton instance
export const env = new EnvironmentManager();

// Export types for external use
export type { EnvConfig };