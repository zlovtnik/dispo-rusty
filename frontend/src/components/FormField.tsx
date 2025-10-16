import React, { memo } from 'react';
import { useFormContext } from 'react-hook-form';
import { Form, Input, InputNumber, Select, Checkbox } from 'antd';
import type { InputNumberProps, SelectProps } from 'antd';
import type { Rule } from 'antd/es/form';
import type { FormItemProps } from 'antd/es/form/FormItem';
import { EyeInvisibleOutlined, EyeTwoTone, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

interface BaseFormFieldProps {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  rules?: Rule[];
  help?: string;
  extra?: string;
  tooltip?: FormItemProps['tooltip'];
  validateStatus?: 'success' | 'warning' | 'error' | 'validating';
  className?: string;
}

interface TextFormFieldProps extends BaseFormFieldProps {
  type: 'text' | 'email' | 'password' | 'textarea';
  showCount?: boolean;
  maxLength?: number;
  rows?: number;
}

interface NumberFormFieldProps extends BaseFormFieldProps {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  inputNumberProps?: Partial<InputNumberProps>;
}

interface SelectFormFieldProps extends BaseFormFieldProps {
  type: 'select';
  options: Array<{ value: string | number; label: string; disabled?: boolean }>;
  selectProps?: Partial<SelectProps>;
}

interface CheckboxFormFieldProps extends BaseFormFieldProps {
  type: 'checkbox';
  children?: React.ReactNode;
}

type FormFieldProps = TextFormFieldProps | NumberFormFieldProps | SelectFormFieldProps | CheckboxFormFieldProps;

/**
 * Reusable form field component with React Hook Form integration and validation states
 */
export const FormField = memo<FormFieldProps>(
  ({
    name,
    label,
    required,
    placeholder,
    disabled,
    rules,
    help,
    extra,
    tooltip,
    validateStatus,
    className,
    ...props
  }) => {
    const {
      register,
      formState: { errors, touchedFields, isSubmitted, dirtyFields },
      watch,
    } = useFormContext();

    const fieldError = errors[name];
    const isTouched = touchedFields[name];
    const isDirty = dirtyFields[name];
    const isFieldValid = !fieldError && isTouched;
    const currentValue = watch(name);
    const hasValue = currentValue !== undefined && currentValue !== '' && currentValue !== null;

    // Determine validation status
    const status = validateStatus || (() => {
      if (fieldError && (isTouched || isSubmitted)) {
        return 'error';
      }
      if (isFieldValid) {
        return 'success';
      }
      return undefined;
    })();

    const formItemProps: FormItemProps = {
      name,
      label,
      required,
      rules,
      help: (typeof fieldError?.message === 'string' ? fieldError.message : fieldError?.message) || help,
      extra,
      tooltip,
      validateStatus: status,
      className,
      hasFeedback: true,
      children: null, // Will be set below based on type
    };

    // Add success icon for valid fields
    if (status === 'success') {
      formItemProps.validateStatus = 'success';
      formItemProps.help = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />
          <span style={{ color: 'var(--color-success)' }}>Valid</span>
        </div>
      );
    }

    // Add error icon for invalid fields
    if (status === 'error' && fieldError) {
      const errorMessage = typeof fieldError.message === 'string' ? fieldError.message : 'Invalid input';
      formItemProps.help = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CloseCircleOutlined style={{ color: 'var(--color-danger)' }} />
          <span style={{ color: 'var(--color-danger)' }}>{errorMessage}</span>
        </div>
      );
    }

    const renderField = () => {
      switch (props.type) {
        case 'text':
        case 'email':
          return (
            <Input
              {...register(name)}
              placeholder={placeholder}
              disabled={disabled}
              maxLength={props.maxLength}
              type={props.type === 'email' ? 'email' : 'text'}
              suffix={status === 'success' ? <CheckCircleOutlined style={{ color: 'var(--color-success)' }} /> : null}
            />
          );

        case 'password':
          return (
            <Input.Password
              {...register(name)}
              placeholder={placeholder}
              disabled={disabled}
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              suffix={status === 'success' ? <CheckCircleOutlined style={{ color: 'var(--color-success)' }} /> : null}
            />
          );

        case 'textarea':
          return (
            <Input.TextArea
              {...register(name)}
              placeholder={placeholder}
              disabled={disabled}
              maxLength={props.maxLength}
              showCount={props.showCount}
              rows={props.rows || 4}
              suffix={status === 'success' ? <CheckCircleOutlined style={{ color: 'var(--color-success)' }} /> : null}
            />
          );

        case 'number':
          return (
            <InputNumber
              {...register(name)}
              placeholder={placeholder}
              disabled={disabled}
              min={props.min}
              max={props.max}
              step={props.step}
              precision={props.precision}
              style={{ width: '100%' }}
              {...(props as NumberFormFieldProps).inputNumberProps}
            />
          );

        case 'select':
          return (
            <Select
              placeholder={placeholder}
              disabled={disabled}
              {...(props as SelectFormFieldProps).selectProps}
            >
              {props.options.map(({ value, label, disabled: optionDisabled }) => (
                <Select.Option key={value} value={value} disabled={optionDisabled}>
                  {label}
                </Select.Option>
              ))}
            </Select>
          );

        case 'checkbox':
          return (
            <Checkbox
              {...register(name)}
              disabled={disabled}
              style={{ marginLeft: 0 }}
            >
              {(props as CheckboxFormFieldProps).children}
            </Checkbox>
          );

        default:
          return (
            <Input
              {...register(name)}
              placeholder={placeholder}
              disabled={disabled}
            />
          );
      }
    };

    // For checkbox, we need to handle layout differently
    if (props.type === 'checkbox') {
      return (
        <Form.Item {...formItemProps} valuePropName="checked">
          {renderField()}
        </Form.Item>
      );
    }

    return <Form.Item {...formItemProps}>{renderField()}</Form.Item>;
  }
);

FormField.displayName = 'FormField';
