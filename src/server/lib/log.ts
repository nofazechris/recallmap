/** Structured JSON logs. Never pass secrets, document text or submitted answers here. */
type Fields = Record<string, unknown>;
const out = (level: 'info' | 'warn' | 'error', event: string, fields: Fields) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
};
export const log = {
  info: (event: string, fields: Fields = {}) => out('info', event, fields),
  warn: (event: string, fields: Fields = {}) => out('warn', event, fields),
  error: (event: string, fields: Fields = {}) => out('error', event, fields),
};

export const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
