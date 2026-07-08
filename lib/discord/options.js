export function focusedOption(options = []) {
  for (const option of options) {
    if (option.focused) {
      return option;
    }

    const nested = focusedOption(option.options);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}
