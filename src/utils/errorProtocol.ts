export type ErrorCategory = 'validation' | 'action' | 'conflict';

export type StructuredErrorMeta = {
  category: ErrorCategory;
  action: string;
  recoverable: boolean;
  i18nKey?: string;
  detail?: string;
};
