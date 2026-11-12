// Option normalisation for SearchableSelect (Requirement 12). Pure functions, unit-tested.
import { Children, isValidElement } from "react";

export const textOf = (node) => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf(node.props.children);
  return "";
};

/** Flattens `options` and `<option>` children into one normalised list. Exported for tests. */
export const normaliseOptions = (options = [], children) => {
  const list = [];
  for (const option of options) {
    if (typeof option === "string" || typeof option === "number") {
      list.push({ value: String(option), label: String(option) });
    } else if (option && typeof option === "object") {
      const value = option.value ?? option.label ?? "";
      list.push({
        value: String(value),
        label: String(option.label ?? value),
        description: option.description || "",
        disabled: Boolean(option.disabled),
      });
    }
  }
  const visit = (node) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === "option") {
        const label = textOf(child.props.children);
        list.push({
          value: String(child.props.value ?? label),
          label,
          disabled: Boolean(child.props.disabled),
        });
      } else if (child.type === "optgroup") {
        visit(child.props.children);
      }
    });
  };
  visit(children);
  return list;
};


