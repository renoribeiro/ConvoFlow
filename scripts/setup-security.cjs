#!/usr/bin/env node

/**
 * Security Setup Script for ConvoFlow
 * 
 * This script automatically configures security best practices
 * Run with: node scripts/setup-security.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecuritySetup {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.changes = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📋',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }[type] || '📋';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  recordChange(description) {
    this.changes.push(description);
    this.log(description, 'success');
  }

  ensureDirectoryExists(dirPath) {
    const fullPath = path.join(this.projectRoot, dirPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      this.recordChange(`Created directory: ${dirPath}`);
    }
  }

  writeFileIfNotExists(filePath, content, description) {
    const fullPath = path.join(this.projectRoot, filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.ensureDirectoryExists(path.dirname(filePath));
      fs.writeFileSync(fullPath, content, 'utf8');
      this.recordChange(description || `Created file: ${filePath}`);
      return true;
    } else {
      this.log(`File already exists: ${filePath}`, 'warning');
      return false;
    }
  }

  updateFileContent(filePath, updater, description) {
    const fullPath = path.join(this.projectRoot, filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.log(`File not found: ${filePath}`, 'error');
      return false;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const newContent = updater(content);
      
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        this.recordChange(description || `Updated file: ${filePath}`);
        return true;
      } else {
        this.log(`No changes needed in: ${filePath}`);
        return false;
      }
    } catch (error) {
      this.log(`Failed to update ${filePath}: ${error.message}`, 'error');
      return false;
    }
  }

  generateSecureKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  setupEnvironmentFiles() {
    this.log('Setting up environment configuration...');
    
    // Create .env.example with secure defaults
    const envExample = `# ConvoFlow Environment Configuration
# Copy this file to .env and fill in your actual values

# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/convoflow"
DIRECT_URL="postgresql://username:password@localhost:5432/convoflow"

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Evolution API Configuration
EVOLUTION_API_URL="https://your-evolution-api.com"
EVOLUTION_API_KEY="your-evolution-api-key"

# Security Configuration
NEXTAUTH_SECRET="${this.generateSecureKey()}"
NEXTAUTH_URL="http://localhost:3000"

# Application Configuration
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# Logging Configuration
LOG_LEVEL="info"
LOG_FORMAT="json"

# Rate Limiting
RATE_LIMIT_MAX="100"
RATE_LIMIT_WINDOW="900000"

# CORS Configuration
ALLOWED_ORIGINS="http://localhost:3000,https://your-domain.com"
`;
    
    this.writeFileIfNotExists('.env.example', envExample, 'Created .env.example with secure defaults');
    
    // Update .gitignore to ensure security
    this.updateFileContent('.gitignore', (content) => {
      const securityEntries = [
        '# Environment files',
        '.env',
        '.env.local',
        '.env.development.local',
        '.env.test.local',
        '.env.production.local',
        '',
        '# Security files',
        '*.pem',
        '*.key',
        '*.crt',
        'secrets/',
        '',
        '# Logs',
        'logs/',
        '*.log',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*'
      ];
      
      let newContent = content;
      
      for (const entry of securityEntries) {
        if (!content.includes(entry) && entry.trim()) {
          newContent += `\n${entry}`;
        }
      }
      
      return newContent;
    }, 'Updated .gitignore with security entries');
  }

  setupSecurityHeaders() {
    this.log('Setting up security headers...');
    
    const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
`;
    
    this.writeFileIfNotExists('next.config.js', nextConfig, 'Created next.config.js with security headers');
  }

  setupPackageJsonScripts() {
    this.log('Setting up security scripts in package.json...');
    
    this.updateFileContent('package.json', (content) => {
      try {
        const packageJson = JSON.parse(content);
        
        if (!packageJson.scripts) {
          packageJson.scripts = {};
        }
        
        // Add security-related scripts
        const securityScripts = {
          'security:check': 'node scripts/security-check.js',
          'security:setup': 'node scripts/setup-security.js',
          'security:audit': 'npm audit --audit-level moderate',
          'security:fix': 'npm audit fix',
          'lint:security': 'eslint . --ext .ts,.tsx,.js,.jsx --config .eslintrc.security.js'
        };
        
        let hasChanges = false;
        for (const [key, value] of Object.entries(securityScripts)) {
          if (!packageJson.scripts[key]) {
            packageJson.scripts[key] = value;
            hasChanges = true;
          }
        }
        
        return hasChanges ? JSON.stringify(packageJson, null, 2) : content;
      } catch (error) {
        this.log(`Failed to parse package.json: ${error.message}`, 'error');
        return content;
      }
    }, 'Added security scripts to package.json');
  }

  setupESLintSecurity() {
    this.log('Setting up ESLint security configuration...');
    
    const eslintSecurityConfig = `{
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended"
  ],
  "plugins": [
    "security"
  ],
  "rules": {
    "security/detect-object-injection": "error",
    "security/detect-non-literal-regexp": "error",
    "security/detect-unsafe-regex": "error",
    "security/detect-buffer-noassert": "error",
    "security/detect-child-process": "error",
    "security/detect-disable-mustache-escape": "error",
    "security/detect-eval-with-expression": "error",
    "security/detect-no-csrf-before-method-override": "error",
    "security/detect-non-literal-fs-filename": "error",
    "security/detect-non-literal-require": "error",
    "security/detect-possible-timing-attacks": "error",
    "security/detect-pseudoRandomBytes": "error",
    "no-console": "warn",
    "no-debugger": "error",
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-script-url": "error"
  },
  "env": {
    "node": true,
    "browser": true,
    "es2022": true
  },
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  }
}
`;
    
    this.writeFileIfNotExists('.eslintrc.security.js', `module.exports = ${eslintSecurityConfig};`, 'Created ESLint security configuration');
  }

  setupDocumentation() {
    this.log('Setting up security documentation...');
    
    const securityChecklist = `# Security Checklist for ConvoFlow

## Pre-deployment Security Checklist

### Environment & Configuration
- [ ] All environment variables are properly configured
- [ ] No hardcoded secrets in code
- [ ] .env files are in .gitignore
- [ ] JWT verification is enabled in Supabase
- [ ] Security headers are configured

### Code Security
- [ ] Input validation is implemented
- [ ] SQL injection protection is in place
- [ ] XSS protection is implemented
- [ ] CSRF protection is enabled
- [ ] Rate limiting is configured

### Dependencies
- [ ] All dependencies are up to date
- [ ] Security audit has been run
- [ ] No known vulnerabilities in dependencies

### Logging & Monitoring
- [ ] Secure logging is implemented
- [ ] Sensitive data is not logged
- [ ] Error handling doesn't expose sensitive information
- [ ] Monitoring is configured

### Database Security
- [ ] RLS (Row Level Security) is enabled
- [ ] Database connections are encrypted
- [ ] Proper access controls are in place
- [ ] Regular backups are configured

### API Security
- [ ] Authentication is required for protected endpoints
- [ ] Authorization is properly implemented
- [ ] API rate limiting is configured
- [ ] Input validation on all endpoints

## Security Scripts

### Run Security Check
\`\`\`bash
npm run security:check
\`\`\`

### Run Security Audit
\`\`\`bash
npm run security:audit
\`\`\`

### Fix Security Issues
\`\`\`bash
npm run security:fix
\`\`\`

### Lint for Security Issues
\`\`\`bash
npm run lint:security
\`\`\`

## Regular Security Tasks

1. **Weekly**: Run security audit and fix issues
2. **Monthly**: Review and update dependencies
3. **Quarterly**: Review security configurations
4. **Before each release**: Run complete security checklist

## Incident Response

If a security issue is discovered:

1. **Immediate**: Assess the severity and impact
2. **Within 1 hour**: Implement temporary mitigation if needed
3. **Within 24 hours**: Implement permanent fix
4. **Within 48 hours**: Review and update security measures
5. **Within 1 week**: Conduct post-incident review

## Contact

For security concerns, contact: [security@yourcompany.com]
`;
    
    this.writeFileIfNotExists('SECURITY_CHECKLIST.md', securityChecklist, 'Created security checklist documentation');
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('SECURITY SETUP COMPLETED');
    console.log('='.repeat(60));
    
    if (this.changes.length > 0) {
      console.log('\n📋 Changes made:');
      this.changes.forEach((change, index) => {
        console.log(`${index + 1}. ${change}`);
      });
    } else {
      console.log('\n✅ No changes needed - security is already configured!');
    }
    
    console.log('\n🔒 Next steps:');
    console.log('1. Copy .env.example to .env and fill in your values');
    console.log('2. Run: npm run security:check');
    console.log('3. Run: npm run security:audit');
    console.log('4. Review SECURITY_CHECKLIST.md');
    console.log('5. Configure monitoring and alerting');
    
    console.log('\n' + '='.repeat(60));
  }

  run() {
    console.log('🔒 ConvoFlow Security Setup');
    console.log('Configuring security best practices...');
    
    this.setupEnvironmentFiles();
    this.setupSecurityHeaders();
    this.setupPackageJsonScripts();
    this.setupESLintSecurity();
    this.setupDocumentation();
    
    this.generateReport();
    
    return this.changes.length;
  }
}

// Run the security setup
if (require.main === module) {
  const setup = new SecuritySetup();
  setup.run();
}

module.exports = SecuritySetup;