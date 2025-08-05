#!/usr/bin/env node

/**
 * Security Check Script for ConvoFlow
 * 
 * This script validates security configurations and best practices
 * Run with: node scripts/security-check.js
 */

const fs = require('fs');
const path = require('path');

class SecurityChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.passed = [];
    this.projectRoot = path.resolve(__dirname, '..');
  }

  log(type, message, details = '') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    
    if (details) {
      console.log(`${logMessage}\n  Details: ${details}`);
    } else {
      console.log(logMessage);
    }
  }

  error(message, details = '') {
    this.errors.push({ message, details });
    this.log('error', message, details);
  }

  warning(message, details = '') {
    this.warnings.push({ message, details });
    this.log('warning', message, details);
  }

  pass(message) {
    this.passed.push(message);
    this.log('pass', message);
  }

  checkFileExists(filePath, required = true) {
    const fullPath = path.join(this.projectRoot, filePath);
    const exists = fs.existsSync(fullPath);
    
    if (required && !exists) {
      this.error(`Required file missing: ${filePath}`);
    } else if (!required && !exists) {
      this.warning(`Optional file missing: ${filePath}`);
    } else {
      this.pass(`File exists: ${filePath}`);
    }
    
    return exists;
  }

  checkFileContent(filePath, patterns, description) {
    const fullPath = path.join(this.projectRoot, filePath);
    
    if (!fs.existsSync(fullPath)) {
      this.error(`Cannot check ${description}: file ${filePath} not found`);
      return false;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      for (const pattern of patterns) {
        if (pattern.required && !pattern.regex.test(content)) {
          this.error(`${description}: Missing required pattern`, pattern.description);
        } else if (!pattern.required && pattern.regex.test(content)) {
          this.warning(`${description}: Found discouraged pattern`, pattern.description);
        } else if (pattern.required && pattern.regex.test(content)) {
          this.pass(`${description}: ${pattern.description}`);
        }
      }
    } catch (error) {
      this.error(`Failed to read ${filePath}`, error.message);
    }
  }

  checkEnvironmentFiles() {
    console.log('\n=== Checking Environment Configuration ===');
    
    // Check .env.example exists
    this.checkFileExists('.env.example', true);
    
    // Check .env is not in repository
    if (this.checkFileExists('.env', false)) {
      this.warning('.env file exists - ensure it\'s not committed to repository');
    }
    
    // Check .gitignore includes environment files
    this.checkFileContent('.gitignore', [
      {
        regex: /\.env$/m,
        required: true,
        description: '.env files are ignored'
      },
      {
        regex: /\.env\.local$/m,
        required: true,
        description: '.env.local files are ignored'
      }
    ], 'GitIgnore environment protection');
  }

  checkSupabaseConfig() {
    console.log('\n=== Checking Supabase Configuration ===');
    
    this.checkFileContent('supabase/config.toml', [
      {
        regex: /verify_jwt\s*=\s*true/,
        required: true,
        description: 'JWT verification is enabled'
      },
      {
        regex: /verify_jwt\s*=\s*false/,
        required: false,
        description: 'JWT verification disabled (security risk)'
      }
    ], 'Supabase Edge Functions security');
  }

  checkCodeSecurity() {
    console.log('\n=== Checking Code Security ===');
    
    // Check for hardcoded secrets in main source files
    const sourceFiles = this.getSourceFiles('src');
    
    for (const file of sourceFiles) {
      this.checkFileContent(file, [
        {
          regex: /(password|secret|key|token)\s*[:=]\s*['"][^'"]{10,}['"]/i,
          required: false,
          description: 'Potential hardcoded secret found'
        },
        {
          regex: /console\.log\(/,
          required: false,
          description: 'Direct console.log usage (use logger instead)'
        },
        {
          regex: /dangerouslySetInnerHTML/,
          required: false,
          description: 'dangerouslySetInnerHTML usage (review for XSS)'
        }
      ], `Code security in ${file}`);
    }
  }

  checkDependencies() {
    console.log('\n=== Checking Dependencies ===');
    
    // Check if security-related packages are present
    this.checkFileContent('package.json', [
      {
        regex: /"zod":/,
        required: true,
        description: 'Zod validation library is present'
      }
    ], 'Security dependencies');
  }

  getSourceFiles(dir) {
    const files = [];
    const fullDir = path.join(this.projectRoot, dir);
    
    if (!fs.existsSync(fullDir)) {
      return files;
    }

    const items = fs.readdirSync(fullDir);
    
    for (const item of items) {
      const fullPath = path.join(fullDir, item);
      const relativePath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getSourceFiles(relativePath));
      } else if (item.match(/\.(ts|tsx|js|jsx)$/)) {
        files.push(relativePath);
      }
    }
    
    return files;
  }

  checkSecurityFiles() {
    console.log('\n=== Checking Security Documentation ===');
    
    this.checkFileExists('SECURITY.md', true);
    this.checkFileExists('src/lib/env.ts', true);
    this.checkFileExists('src/lib/logger.ts', true);
    this.checkFileExists('src/lib/validation.ts', true);
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('SECURITY CHECK REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n✅ Passed: ${this.passed.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Errors: ${this.errors.length}`);
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.message}`);
        if (warning.details) {
          console.log(`   ${warning.details}`);
        }
      });
    }
    
    if (this.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.message}`);
        if (error.details) {
          console.log(`   ${error.details}`);
        }
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (this.errors.length === 0) {
      console.log('🎉 Security check completed successfully!');
      if (this.warnings.length > 0) {
        console.log('💡 Please review the warnings above.');
      }
      return 0;
    } else {
      console.log('🚨 Security issues found! Please fix the errors above.');
      return 1;
    }
  }

  run() {
    console.log('🔒 ConvoFlow Security Check');
    console.log('Starting security validation...');
    
    this.checkEnvironmentFiles();
    this.checkSupabaseConfig();
    this.checkSecurityFiles();
    this.checkDependencies();
    this.checkCodeSecurity();
    
    return this.generateReport();
  }
}

// Run the security check
if (require.main === module) {
  const checker = new SecurityChecker();
  const exitCode = checker.run();
  process.exit(exitCode);
}

module.exports = SecurityChecker;