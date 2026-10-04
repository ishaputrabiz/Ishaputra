// ============================================
// PASSWORD VALIDATION & STRENGTH UTILITIES
// Production-grade password security for eCommerce
// ============================================

export interface PasswordStrengthResult {
  score: number; // 0-4 (0: very weak, 4: very strong)
  strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
  feedback: string[];
  meetsMinimum: boolean;
  color: string;
  percentage: number;
}

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  maxLength?: number;
}

// Default requirements: the one password policy for sign-up and reset
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
  maxLength: 128,
};

// Common weak passwords to block
const WEAK_PASSWORDS = new Set([
  'password', 'password123', '12345678', '123456789', 'qwerty', 'abc123',
  'letmein', 'welcome', 'monkey', 'password1', 'admin', 'admin123',
  'iloveyou', 'trustno1', 'sunshine', 'master', 'dragon', 'baseball',
  'football', 'princess', 'welcome123', 'login', 'passw0rd', 'silver',
  'jewelry', 'jewellery', 'gold', 'diamond',
]);

/**
 * Validate password against requirements
 */
export const validatePassword = (
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check minimum length
  if (password.length < requirements.minLength) {
    errors.push(`Password must be at least ${requirements.minLength} characters`);
  }

  // Check maximum length
  if (requirements.maxLength && password.length > requirements.maxLength) {
    errors.push(`Password must be less than ${requirements.maxLength} characters`);
  }

  // Check uppercase
  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check lowercase
  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check number
  if (requirements.requireNumber && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check symbol
  if (requirements.requireSymbol && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check against weak passwords
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    errors.push('This password is too common. Please choose a stronger password');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Calculate password strength score (0-4)
 */
export const calculatePasswordStrength = (password: string): PasswordStrengthResult => {
  let score = 0;
  const feedback: string[] = [];

  // Length scoring
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 0.5;

  // Character variety scoring
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  if (hasLower) score += 0.5;
  if (hasUpper) score += 0.5;
  if (hasNumber) score += 0.5;
  if (hasSymbol) score += 0.5;

  // Bonus for mixing character types
  const varietyCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;
  if (varietyCount >= 3) score += 0.5;
  if (varietyCount === 4) score += 0.5;

  // Penalty for common patterns
  if (/(.)\1{2,}/.test(password)) {
    score -= 0.5; // Repeated characters (aaa, 111)
    feedback.push('Avoid repeated characters');
  }
  if (/^[0-9]+$/.test(password)) {
    score -= 1; // Only numbers
    feedback.push('Use a mix of letters, numbers, and symbols');
  }
  if (/^[a-zA-Z]+$/.test(password)) {
    score -= 0.5; // Only letters
    feedback.push('Add numbers and symbols for better security');
  }
  if (/123|234|345|456|567|678|789|890|abc|bcd|cde/.test(password.toLowerCase())) {
    score -= 0.5; // Sequential patterns
    feedback.push('Avoid sequential patterns');
  }

  // Check against weak passwords
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    score = 0;
    feedback.push('This is a commonly used password');
  }

  // Normalize score to 0-4
  score = Math.max(0, Math.min(4, score));

  // Determine strength level
  let strength: PasswordStrengthResult['strength'];
  let color: string;
  let strengthFeedback: string;

  if (score < 1) {
    strength = 'very-weak';
    color = 'hsl(var(--destructive))';
    strengthFeedback = 'Very weak - not recommended';
  } else if (score < 2) {
    strength = 'weak';
    color = 'hsl(var(--destructive))';
    strengthFeedback = 'Weak - add more variety';
  } else if (score < 3) {
    strength = 'fair';
    color = 'hsl(var(--highlight))';
    strengthFeedback = 'Fair - could be stronger';
  } else if (score < 4) {
    strength = 'good';
    color = 'hsl(var(--primary) / 0.8)';
    strengthFeedback = 'Good password';
  } else {
    strength = 'strong';
    color = 'hsl(var(--primary))';
    strengthFeedback = 'Strong password';
  }

  feedback.unshift(strengthFeedback);

  // Check if meets minimum requirements
  const { valid: meetsMinimum } = validatePassword(password);

  return {
    score: Math.round(score),
    strength,
    feedback,
    meetsMinimum,
    color,
    percentage: (score / 4) * 100,
  };
};

/**
 * Bar colour for the strength meter (Tailwind tokens, light and dark).
 * Only the bar carries colour; the strength word stays in the text colour.
 */
export const getStrengthColorClass = (strength: PasswordStrengthResult['strength']): string => {
  switch (strength) {
    case 'very-weak':
    case 'weak':
      return 'bg-destructive';
    case 'fair':
      return 'bg-highlight';
    case 'good':
      return 'bg-primary/80';
    case 'strong':
      return 'bg-primary';
    default:
      return 'bg-foreground/10';
  }
};

/**
 * Text colour for the strength word. Kept in the normal text colour so it
 * passes contrast in both themes; the bar shows the level.
 */
export const getStrengthTextColorClass = (strength: PasswordStrengthResult['strength']): string => {
  switch (strength) {
    case 'very-weak':
    case 'weak':
    case 'fair':
    case 'good':
    case 'strong':
      return 'text-foreground';
    default:
      return 'text-muted-foreground';
  }
};

/** Display name of a strength level ("Very weak", "Fair"). */
export const getStrengthLabel = (strength: PasswordStrengthResult['strength']): string => {
  switch (strength) {
    case 'very-weak':
      return 'Very weak';
    case 'weak':
      return 'Weak';
    case 'fair':
      return 'Fair';
    case 'good':
      return 'Good';
    case 'strong':
      return 'Strong';
    default:
      return '';
  }
};

/**
 * Check if password contains personal information
 */
export const containsPersonalInfo = (
  password: string,
  personalData: { email?: string; name?: string; username?: string }
): boolean => {
  const lowerPassword = password.toLowerCase();
  
  if (personalData.email) {
    const emailParts = personalData.email.toLowerCase().split('@')[0].split(/[._-]/);
    for (const part of emailParts) {
      if (part.length >= 3 && lowerPassword.includes(part)) {
        return true;
      }
    }
  }
  
  if (personalData.name) {
    const nameParts = personalData.name.toLowerCase().split(' ');
    for (const part of nameParts) {
      if (part.length >= 3 && lowerPassword.includes(part)) {
        return true;
      }
    }
  }
  
  if (personalData.username) {
    const username = personalData.username.toLowerCase();
    if (username.length >= 3 && lowerPassword.includes(username)) {
      return true;
    }
  }
  
  return false;
};

/**
 * Generate password requirements text
 */
export const getPasswordRequirementsText = (
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): string[] => {
  const texts: string[] = [];
  
  texts.push(`At least ${requirements.minLength} characters`);
  if (requirements.requireUppercase) texts.push('One uppercase letter');
  if (requirements.requireLowercase) texts.push('One lowercase letter');
  if (requirements.requireNumber) texts.push('One number');
  if (requirements.requireSymbol) texts.push('One special character (!@#$%^&*)');
  
  return texts;
};

/**
 * Each requirement with whether the password meets it, for a live checklist.
 * Mirrors validatePassword's rules (same order as getPasswordRequirementsText).
 */
export const getPasswordRequirementChecks = (
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): { label: string; met: boolean }[] => {
  const checks: { label: string; met: boolean }[] = [
    { label: `At least ${requirements.minLength} characters`, met: password.length >= requirements.minLength },
  ];
  if (requirements.requireUppercase) checks.push({ label: 'One uppercase letter', met: /[A-Z]/.test(password) });
  if (requirements.requireLowercase) checks.push({ label: 'One lowercase letter', met: /[a-z]/.test(password) });
  if (requirements.requireNumber) checks.push({ label: 'One number', met: /\d/.test(password) });
  if (requirements.requireSymbol) {
    checks.push({
      label: 'One special character (!@#$%^&*)',
      met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    });
  }
  return checks;
};
