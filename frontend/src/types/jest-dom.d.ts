import '@testing-library/jest-dom';

// Augment Bun's test types to include jest-dom matchers
declare module 'bun:test' {
  interface Matchers<T> {
    toBeInTheDocument(): T;
    toBeVisible(): T;
    toHaveClass(...classNames: string[]): T;
    toHaveAttribute(attr: string, value?: string): T;
    toHaveValue(value?: string | number | string[]): T;
    toBeChecked(): T;
    toBeDisabled(): T;
    toBeEnabled(): T;
    toBeEmptyDOMElement(): T;
    toBeInvalid(): T;
    toBeValid(): T;
    toBeRequired(): T;
    toHaveFocus(): T;
    toHaveDisplayValue(value: string | RegExp | (string | RegExp)[]): T;
    toHaveDescription(text?: string | RegExp): T;
    toHaveErrorMessage(text?: string | RegExp): T;
    toBePartiallyChecked(): T;
    toHaveAccessibleDescription(text?: string | RegExp): T;
    toHaveAccessibleName(text?: string | RegExp): T;
    toHaveRole(role: string): T;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace: boolean }): T;
  }
}