import React, { memo } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import type { RegisterOptions } from 'react-hook-form';
import { Form, Input, InputNumber, Select, Checkbox } from 'antd';
import type { InputNumberProps, SelectProps } from 'antd';
import type { FormItemProps } from 'antd/es/form/FormItem';
import {
  EyeInvisibleOutlined,
  EyeTwoTone,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';

/**
 * Performs shallow equality comparison between two objects
 * @param obj1 - First object to compare
 * @param obj2 - Second object to compare
 * @returns true if objects are shallowly equal, false otherwise
 */
function shallowEqual(obj1: unknown, obj2: unknown): boolean {
  // Handle null/undefined cases
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return obj1 === obj2;

  // Handle non-object types (strings, numbers, booleans, etc.)
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }

  // Handle arrays
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    return obj1.every((item, index) => item === obj2[index]);
  }

  // Handle objects (shallow comparison)
  if (typeof obj1 === 'object' && typeof obj2 === 'object') {
    const o1 = obj1 as Record<PropertyKey, unknown>;
    const o2 = obj2 as Record<PropertyKey, unknown>;
    const keys1 = Reflect.ownKeys(o1);
    const keys2 = Reflect.ownKeys(o2);
    if (keys1.length !== keys2.length) return false;
    return keys1.every(key => Object.prototype.hasOwnProperty.call(o2, key) && o1[key] === o2[key]);
  }

  return false;
}

interface BaseFormFieldProps {
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
  options: { value: string | number; label: string; disabled?: boolean }[];
  selectProps?: Partial<SelectProps>;
}

interface CheckboxFormFieldProps extends BaseFormFieldProps {
  type: 'checkbox';
  children?: React.ReactNode;
}

type FormFieldProps =
  | TextFormFieldProps
  | NumberFormFieldProps
  | SelectFormFieldProps
  | CheckboxFormFieldProps;

/**
 * Custom comparison function for FormField memo optimization
 * Compares props to prevent unnecessary re-renders when objects/functions haven't changed
 *
 * @param prevProps - Previous props object
 * @param nextProps - Next props object
 * @returns true if props are equal (no re-render needed), false otherwise
 *
 * @note For optimal performance, consumers should memoize complex props like rules and tooltip
 * using useMemo to prevent unnecessary re-renders when parent components recreate these objects.
 *
 * @example
 * ```tsx
 * const memoizedRules = useMemo(() => ({
 *   required: 'This field is required',
 *   minLength: { value: 3, message: 'Minimum 3 characters' }
 * }), []);
 *
 * const memoizedTooltip = useMemo(() => ({
 *   title: 'This is a helpful tooltip',
 *   placement: 'top'
 * }), []);
 *
 * <FormField rules={memoizedRules} tooltip={memoizedTooltip} ... />
 * ```
 */
const areEqual = (prevProps: FormFieldProps, nextProps: FormFieldProps): boolean => {
  // Compare primitive props
  if (
    prevProps.name !== nextProps.name ||
    prevProps.label !== nextProps.label ||
    prevProps.required !== nextProps.required ||
    prevProps.placeholder !== nextProps.placeholder ||
    prevProps.disabled !== nextProps.disabled ||
    prevProps.type !== nextProps.type ||
    prevProps.help !== nextProps.help ||
    prevProps.extra !== nextProps.extra ||
    prevProps.className !== nextProps.className ||
    prevProps.validateStatus !== nextProps.validateStatus
  ) {
    return false;
  }

  // Compare rules object using shallow equality to prevent spurious re-renders
  // when parent components recreate the rules object with the same content
  if (!shallowEqual(prevProps.rules, nextProps.rules)) {
    return false;
  }

  // Compare tooltip object using shallow equality to prevent spurious re-renders
  // when parent components recreate the tooltip object with the same content
  if (!shallowEqual(prevProps.tooltip, nextProps.tooltip)) {
    return false;
  }

  // Compare type-specific props based on field type

  // Text field specific props
  if (
    prevProps.type === 'text' ||
    prevProps.type === 'email' ||
    prevProps.type === 'password' ||
    prevProps.type === 'textarea'
  ) {
    if (prevProps.showCount !== (nextProps as TextFormFieldProps).showCount) {
      return false;
    }
    if (prevProps.maxLength !== (nextProps as TextFormFieldProps).maxLength) {
      return false;
    }
    if (prevProps.rows !== (nextProps as TextFormFieldProps).rows) {
      return false;
    }
  }

  // Number field specific props
  if (prevProps.type === 'number') {
    if (prevProps.min !== (nextProps as NumberFormFieldProps).min) {
      return false;
    }
    if (prevProps.max !== (nextProps as NumberFormFieldProps).max) {
      return false;
    }
    if (prevProps.step !== (nextProps as NumberFormFieldProps).step) {
      return false;
    }
    if (prevProps.precision !== (nextProps as NumberFormFieldProps).precision) {
      return false;
    }
    if (
      !shallowEqual(
        prevProps.inputNumberProps,
        (nextProps as NumberFormFieldProps).inputNumberProps
      )
    ) {
      return false;
    }
  }

  // Select field specific props
  if (prevProps.type === 'select') {
    const prev = prevProps;
    const next = nextProps as SelectFormFieldProps;
    // options is required, just compare references
    if (prev.options !== next.options) {
      return false;
    }
    if (!shallowEqual(prev.selectProps, next.selectProps)) {
      return false;
    }
  }

  // Checkbox field specific props
  if (prevProps.type === 'checkbox') {
    if (prevProps.children !== (nextProps as CheckboxFormFieldProps).children) {
      return false;
    }
  }

  return true;
};

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
    const { control, formState, getFieldState } = useFormContext();

    const { error: fieldError, isTouched } = getFieldState(name, formState);
    const isFieldValid = !fieldError && isTouched;
    const { isSubmitted } = formState;

    // Determine validation status
    const status =
      validateStatus ??
      (fieldError && (isTouched || isSubmitted) ? 'error' : isFieldValid ? 'success' : undefined);

    const formItemProps: FormItemProps = {
      label,
      required,
      help: fieldError?.message ?? help,
      extra,
      tooltip,
      validateStatus: status,
      className,
      hasFeedback: true,
    };

    // Add success icon for valid fields
    if (status === 'success') {
      formItemProps.validateStatus = 'success';
      if (help == null) {
        formItemProps.help = (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />
            <span style={{ color: 'var(--color-success)' }}>Valid</span>
          </div>
        );
      }
    }

    // Add error icon for invalid fields
    if (status === 'error' && fieldError) {
      const errorMessage =
        typeof fieldError.message === 'string' ? fieldError.message : 'Invalid input';
      formItemProps.help = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CloseCircleOutlined style={{ color: 'var(--color-danger)' }} />
          <span style={{ color: 'var(--color-danger)' }}>{errorMessage}</span>
        </div>
      );
    }

    const renderField = (): React.ReactNode => {
      switch (props.type) {
        case 'text':
        case 'email':
          return (
            <Controller
              name={name}
              control={control}
              rules={rules}
              defaultValue=""
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder={placeholder}
                  disabled={disabled}
                  maxLength={props.maxLength}
                  type={props.type === 'email' ? 'email' : 'text'}
                />
              )}
            />
          );

        case 'password':
          return (
            <Controller
              name={name}
              control={control}
              rules={rules}
              defaultValue=""
              render={({ field }) => (
                <Input.Password
                  {...field}
                  placeholder={placeholder}
                  disabled={disabled}
                  iconRender={visible => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                />
              )}
            />
          );

        case 'textarea':
          return (
            <Controller
              name={name}
              control={control}
              rules={rules}
              defaultValue=""
              render={({ field }) => (
                <Input.TextArea
                  {...field}
                  placeholder={placeholder}
                  disabled={disabled}
                  maxLength={props.maxLength}
                  showCount={props.showCount}
                  rows={props.rows ?? 4}
                />
              )}
            />
          );

        case 'number':
          return (
            <Controller
              name={name}
              control={control}
              rules={rules}
              defaultValue={undefined}
              render={({ field: { onChange, value, ...field } }) => (
                <InputNumber
                  {...field}
                  value={(value ?? null) as number | null}
                  onChange={onChange}
                  placeholder={placeholder}
                  disabled={disabled}
                  min={props.min}
                  max={props.max}
                  step={props.step}
                  precision={props.precision}
                  style={{ width: '100%' }}
                  {...(props as NumberFormFieldProps).inputNumberProps}
                />
              )}
            />
          );

        case 'select':
          return (
            <Controller
              name={name}
              control={control}
              rules={rules}
              defaultValue={undefined}
              render={({ field }) => (
                <Select
                  {...field}
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
              )}
            />
          );

        case 'checkbox': {
          const checkboxProps = props as CheckboxFormFieldProps;
          return (
            <Controller
              name={name}
              control={control}
              rules={rules}
              defaultValue={false}
              render={({ field: { onChange, value, ...field } }) => (
                <Checkbox
                  {...field}
                  checked={value as boolean}
                  onChange={e => {
                    onChange(e.target.checked);
                  }}
                  disabled={disabled}
                  style={{ marginLeft: 0 }}
                >
                  {checkboxProps.children}
                </Checkbox>
              )}
            />
          );
        }

        default:
          return (
            <Controller
              name={name}
              control={control}
              rules={rules}
              defaultValue=""
              render={({ field }) => (
                <Input {...field} placeholder={placeholder} disabled={disabled} />
              )}
            />
          );
      }
    };

    // For checkbox, we need to handle layout differently
    if (props.type === 'checkbox') {
      return (
        <Form.Item {...formItemProps} hasFeedback={false}>
          {renderField()}
        </Form.Item>
      );
    }

    return <Form.Item {...formItemProps}>{renderField()}</Form.Item>;
  },
  areEqual
);

FormField.displayName = 'FormField';
