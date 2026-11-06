/**
 * Converts any Devanagari numerals (०, १, २, ३, ४, ५, ६, ७, ८, ९)
 * to English numerals (0, 1, 2, 3, 4, 5, 6, 7, 8, 9).
 * Ensures all numbers, dates, IDs, and amounts consistently display in English digits.
 */
export function toEnglishDigits(input: string | number | undefined | null): string {
  if (input === undefined || input === null) return '';
  return String(input).replace(/[०-९]/g, (ch) => String(ch.charCodeAt(0) - 2406));
}

/**
 * Formats a Date or date string into clean Marathi month representation with English digits.
 * e.g., "05 नोव्हेंबर 2026" instead of Devanagari digits.
 */
export function formatDateWithEnglishDigits(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return '';

  // If already a preformatted string, convert any Devanagari digits to English
  const text = toEnglishDigits(String(dateInput));
  
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return text;
  }

  const monthsMarathi = [
    'जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून',
    'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'
  ];

  const day = String(d.getDate()).padStart(2, '0');
  const month = monthsMarathi[d.getMonth()];
  const year = d.getFullYear();

  return `${day} ${month} ${year}`;
}
