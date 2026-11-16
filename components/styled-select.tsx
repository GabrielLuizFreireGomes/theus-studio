'use client';

import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

type Option = { value: string; label: string };
const emptyValue = '__no_selection__';
const encoded = (value?: string) => value === '' ? emptyValue : value;

export function StyledSelect({ label, options, value, defaultValue, onChange, name, disabled }: {
  label: string;
  options: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}) {
  return <Select.Root name={name} disabled={disabled} value={encoded(value)} defaultValue={encoded(defaultValue)}
    onValueChange={(raw) => onChange?.(raw === emptyValue ? '' : raw)}>
    <Select.Trigger className="styled-select" aria-label={label}>
      <Select.Value placeholder="Selecione" />
      <Select.Icon asChild><span className="select-icon"><ChevronDown size={17} aria-hidden /></span></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="select-menu" position="popper" align="start" sideOffset={6} collisionPadding={10}>
        <Select.ScrollUpButton className="select-scroll"><ChevronUp size={16} aria-hidden /></Select.ScrollUpButton>
        <Select.Viewport className="select-options">
          {options.map((option) => <Select.Item className="select-option" key={option.value} value={encoded(option.value)!}>
            <Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator><Check size={16} aria-hidden /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
        <Select.ScrollDownButton className="select-scroll"><ChevronDown size={16} aria-hidden /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
