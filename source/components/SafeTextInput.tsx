import React, { useEffect } from 'react';
import TextInput from 'ink-text-input';
import { useUI } from '../contexts/UIContext.js';

type TextInputProps = React.ComponentProps<typeof TextInput>;

export function SafeTextInput(props: TextInputProps) {
  const { setIsTyping } = useUI();
  
  // ink-text-input is active/focused if the `focus` prop is true or undefined
  const isFocused = props.focus !== false;

  useEffect(() => {
    if (isFocused) {
      setIsTyping(true);
      return () => setIsTyping(false);
    }
  }, [isFocused, setIsTyping]);

  return <TextInput {...props} />;
}
