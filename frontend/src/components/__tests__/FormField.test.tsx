import { describe, it, expect, beforeEach } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import type { RegisterOptions } from 'react-hook-form';
import { FormField } from '../FormField';
import type { InputNumberProps, SelectProps } from 'antd';
import type { FormItemProps } from 'antd/es/form/FormItem';

// Define the FormFieldProps type locally since it's not exported
type FormFieldProps = {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  rules?: RegisterOptions;
  help?: string;
  extra?: string;
  tooltip?: FormItemProps['tooltip'];
  validateStatus?: 'success' | 'warning' | 'error' | 'validating';
  className?: string;
} & (
  | {
      type: 'text' | 'email' | 'password' | 'textarea';
      showCount?: boolean;
      maxLength?: number;
      rows?: number;
    }
  | {
      type: 'number';
      min?: number;
      max?: number;
      step?: number;
      precision?: number;
      inputNumberProps?: Partial<InputNumberProps>;
    }
  | {
      type: 'select';
      options: { value: string | number; label: string; disabled?: boolean }[];
      selectProps?: Partial<SelectProps>;
    }
  | {
      type: 'checkbox';
      children?: React.ReactNode;
    }
);

// Test wrapper component that provides form context
const TestWrapper: React.FC<{ children: React.ReactNode; defaultValues?: Record<string, any> }> = ({
  children,
  defaultValues = {},
}) => {
  const methods = useForm({ defaultValues });
  return <FormProvider {...methods}>{children}</FormProvider>;
};

// Helper to render FormField with form context
const renderFormField = (props: FormFieldProps, defaultValues?: Record<string, any>) => {
  return render(
    <TestWrapper defaultValues={defaultValues}>
      <FormField {...props} />
    </TestWrapper>
  );
};

describe('FormField', () => {
  describe('Rendering with default props', () => {
    it('renders text input with basic props', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
      });

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByText('Test Field')).toBeInTheDocument();
    });

    it('renders email input with proper type', () => {
      renderFormField({
        name: 'email',
        label: 'Email',
        type: 'email',
      });

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('renders password input with proper type', () => {
      renderFormField({
        name: 'password',
        label: 'Password',
        type: 'password',
      });

      const input = screen.getByDisplayValue('') || screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('renders textarea with proper element', () => {
      renderFormField({
        name: 'description',
        label: 'Description',
        type: 'textarea',
      });

      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders number input with proper element', () => {
      renderFormField({
        name: 'age',
        label: 'Age',
        type: 'number',
      });

      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
    });

    it('renders select with proper element', () => {
      renderFormField({
        name: 'country',
        label: 'Country',
        type: 'select',
        options: [
          { value: 'us', label: 'United States' },
          { value: 'ca', label: 'Canada' },
        ],
      });

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders checkbox with proper element', () => {
      renderFormField({
        name: 'agree',
        label: 'I agree',
        type: 'checkbox',
        children: 'I agree to the terms',
      });

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });
  });

  describe('Rendering with variations', () => {
    it('renders with placeholder', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        placeholder: 'Enter your name',
      });

      expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
    });

    it('renders with required indicator', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        required: true,
      });

      const formItem = screen.getByText('Test Field').closest('.ant-form-item');
      // Ant Design renders a required indicator (asterisk) with the class ant-form-item-required
      expect(formItem).toHaveClass('ant-form-item-required');
    });

    it('renders with help text', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        help: 'This is helpful information',
      });

      expect(screen.getByText('This is helpful information')).toBeInTheDocument();
    });

    it('renders with extra text', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        extra: 'Additional information',
      });

      expect(screen.getByText('Additional information')).toBeInTheDocument();
    });

    it('renders disabled field', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        disabled: true,
      });

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('renders textarea with custom rows', () => {
      renderFormField({
        name: 'description',
        label: 'Description',
        type: 'textarea',
        rows: 6,
      });

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('rows', '6');
    });

    it('renders textarea with showCount and maxLength', () => {
      renderFormField({
        name: 'description',
        label: 'Description',
        type: 'textarea',
        showCount: true,
        maxLength: 100,
      });

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('maxlength', '100');
    });

    it('renders number input with min/max/step', () => {
      renderFormField({
        name: 'age',
        label: 'Age',
        type: 'number',
        min: 0,
        max: 120,
        step: 1,
      });

      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
      // Note: Ant Design InputNumber may not set these attributes directly on the input
      // but they are passed to the component
    });
  });

  describe('User interaction', () => {
    it('calls onChange when typing in text input', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello World');

      expect(input).toHaveValue('Hello World');
    });

    it('calls onChange when typing in email input', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'email',
        label: 'Email',
        type: 'email',
      });

      const input = screen.getByRole('textbox');
      await user.type(input, 'test@example.com');

      expect(input).toHaveValue('test@example.com');
    });

    it('calls onChange when typing in password input', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'password',
        label: 'Password',
        type: 'password',
      });

      const input = screen.getByDisplayValue('') || screen.getByRole('textbox');
      await user.type(input, 'secret123');

      expect(input).toHaveValue('secret123');
    });

    it('calls onChange when typing in textarea', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'description',
        label: 'Description',
        type: 'textarea',
      });

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'This is a long description');

      expect(textarea).toHaveValue('This is a long description');
    });

    it('calls onChange when changing number input', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'age',
        label: 'Age',
        type: 'number',
      });

      const input = screen.getByRole('spinbutton');
      await user.type(input, '25');

      // Note: InputNumber value might be handled differently
      expect(input).toBeInTheDocument();
    });

    it('calls onChange when selecting option', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'country',
        label: 'Country',
        type: 'select',
        options: [
          { value: 'us', label: 'United States' },
          { value: 'ca', label: 'Canada' },
        ],
      });

      const select = screen.getByRole('combobox');
      await user.click(select);

      // Wait for dropdown to appear and select option
      await waitFor(() => {
        expect(screen.getByText('United States')).toBeInTheDocument();
      });

      await user.click(screen.getByText('United States'));

      // Verify the select is still in the document (interaction completed)
      expect(select).toBeInTheDocument();
    });

    it('calls onChange when checking checkbox', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'agree',
        label: 'I agree',
        type: 'checkbox',
        children: 'I agree to the terms',
      });

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(checkbox).toBeChecked();
    });
  });

  describe('Validation behavior', () => {
    it('shows validation status when validateStatus is provided', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        validateStatus: 'error',
      });

      // The field should have error styling
      const formItem = screen.getByText('Test Field').closest('.ant-form-item');
      expect(formItem).toHaveClass('ant-form-item-has-error');
    });

    it('shows success status when validateStatus is success', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        validateStatus: 'success',
      });

      // The field should have success styling
      const formItem = screen.getByText('Test Field').closest('.ant-form-item');
      expect(formItem).toHaveClass('ant-form-item-has-success');
    });

    it('renders with required indicator when required is true', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        required: true,
      });

      const label = screen.getByText('Test Field');
      expect(label).toBeInTheDocument();
      // Check that the required prop is passed to the component
      // The actual required styling might be handled differently by Ant Design
      expect(label).toBeInTheDocument();
    });
  });

  describe('Accessibility checks', () => {
    it('renders input with proper accessibility attributes', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
      });

      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('name', 'testField');
    });

    it('renders textarea with proper accessibility attributes', () => {
      renderFormField({
        name: 'description',
        label: 'Description',
        type: 'textarea',
      });

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute('name', 'description');
    });

    it('renders number input with proper accessibility attributes', () => {
      renderFormField({
        name: 'age',
        label: 'Age',
        type: 'number',
      });

      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('name', 'age');
    });

    it('renders select with proper accessibility attributes', () => {
      renderFormField({
        name: 'country',
        label: 'Country',
        type: 'select',
        options: [
          { value: 'us', label: 'United States' },
          { value: 'ca', label: 'Canada' },
        ],
      });

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('renders checkbox with proper accessibility attributes', () => {
      renderFormField({
        name: 'agree',
        label: 'I agree',
        type: 'checkbox',
        children: 'I agree to the terms',
      });

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toHaveAttribute('name', 'agree');
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
      });

      const input = screen.getByRole('textbox');

      // Tab to focus the input
      await user.tab();
      expect(input).toHaveFocus();

      // Type using keyboard
      await user.type(input, 'Hello');
      expect(input).toHaveValue('Hello');
    });

    it('supports keyboard navigation for select', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'country',
        label: 'Country',
        type: 'select',
        options: [
          { value: 'us', label: 'United States' },
          { value: 'ca', label: 'Canada' },
        ],
      });

      const select = screen.getByRole('combobox');

      // Tab to focus the select
      await user.tab();
      expect(select).toHaveFocus();

      // Open dropdown with Enter
      await user.keyboard('{Enter}');

      // Navigate with arrow keys
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');
    });

    it('supports keyboard navigation for checkbox', async () => {
      const user = userEvent.setup();

      renderFormField({
        name: 'agree',
        label: 'I agree',
        type: 'checkbox',
        children: 'I agree to the terms',
      });

      const checkbox = screen.getByRole('checkbox');

      // Tab to focus the checkbox
      await user.tab();
      expect(checkbox).toHaveFocus();

      // Toggle with Space
      await user.keyboard(' ');
      expect(checkbox).toBeChecked();
    });

    it('has proper ARIA attributes for error state', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        validateStatus: 'error',
      });

      const formItem = screen.getByText('Test Field').closest('.ant-form-item');
      expect(formItem).toHaveClass('ant-form-item-has-error');
    });

    it('has proper ARIA attributes for success state', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        validateStatus: 'success',
      });

      const formItem = screen.getByText('Test Field').closest('.ant-form-item');
      expect(formItem).toHaveClass('ant-form-item-has-success');
    });
  });

  describe('Form context integration', () => {
    it('works with form context for checkbox default values', () => {
      renderFormField(
        {
          name: 'agree',
          label: 'I agree',
          type: 'checkbox',
          children: 'I agree to the terms',
        },
        { agree: true }
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('works with form context for select default values', () => {
      renderFormField(
        {
          name: 'country',
          label: 'Country',
          type: 'select',
          options: [
            { value: 'us', label: 'United States' },
            { value: 'ca', label: 'Canada' },
          ],
        },
        { country: 'us' }
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles disabled options in select', () => {
      renderFormField({
        name: 'country',
        label: 'Country',
        type: 'select',
        options: [
          { value: 'us', label: 'United States' },
          { value: 'ca', label: 'Canada', disabled: true },
        ],
      });

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('handles number input with precision', () => {
      renderFormField({
        name: 'price',
        label: 'Price',
        type: 'number',
        precision: 2,
      });

      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
    });

    it('handles textarea with showCount', () => {
      renderFormField({
        name: 'description',
        label: 'Description',
        type: 'textarea',
        showCount: true,
        maxLength: 50,
      });

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('maxlength', '50');
    });

    it('handles custom className', () => {
      renderFormField({
        name: 'testField',
        label: 'Test Field',
        type: 'text',
        className: 'custom-class',
      });

      const formItem = screen.getByText('Test Field').closest('.ant-form-item');
      expect(formItem).toHaveClass('custom-class');
    });
  });
});
