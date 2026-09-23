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

// Default requirements for jewellery eCommerce
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
  if (requirements.requireSymbol && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
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
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

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
    color = '#ef4444'; // red-500
    strengthFeedback = 'Very weak - not recommended';
  } else if (score < 2) {
    strength = 'weak';
    color = '#f97316'; // orange-500
    strengthFeedback = 'Weak - add more variety';
  } else if (score < 3) {
    strength = 'fair';
    color = '#eab308'; // yellow-500
    strengthFeedback = 'Fair - could be stronger';
  } else if (score < 4) {
    strength = 'good';
    color = '#22c55e'; // green-500
    strengthFeedback = 'Good password';
  } else {
    strength = 'strong';
    color = '#16a34a'; // green-600
    strengthFeedback = 'Strong password!';
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
 * Get password strength color class (Tailwind)
 */
export const getStrengthColorClass = (strength: PasswordStrengthResult['strength']): string => {
  switch (strength) {
    case 'very-weak':
      return 'bg-red-500';
    case 'weak':
      return 'bg-orange-500';
    case 'fair':
      return 'bg-yellow-500';
    case 'good':
      return 'bg-green-500';
    case 'strong':
      return 'bg-green-600';
    default:
      return 'bg-gray-300';
  }
};

/**
 * Get password strength text color class (Tailwind)
 */
export const getStrengthTextColorClass = (strength: PasswordStrengthResult['strength']): string => {
  switch (strength) {
    case 'very-weak':
      return 'text-red-600';
    case 'weak':
      return 'text-orange-600';
    case 'fair':
      return 'text-yellow-600';
    case 'good':
      return 'text-green-600';
    case 'strong':
      return 'text-green-700';
    default:
      return 'text-gray-600';
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
