// Component tests for the searchable dropdown (Requirement 12): keyboard, search, single and multi,
// clear, loading, empty, disabled, validation wiring and dialog-safe Escape.
import { useState } from "react";
import { afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchableSelect } from "./SearchableSelect";
import { normaliseOptions } from "../../lib/selectOptions";

const FRUITS = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "date", label: "Date", description: "Dried" },
];

const Controlled = ({ initial = "", onChangeSpy = () => {}, ...props }) => {
  const [value, setValue] = useState(initial);
  return (
    <SearchableSelect
      {...props}
      value={value}
      onChange={(e) => {
        onChangeSpy(e.target.value);
        setValue(e.target.value);
      }}
    />
  );
};

afterEach(() => cleanup());

const combo = () => screen.getByRole("combobox");
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");

describe("SearchableSelect", () => {
  it("links its label to the combobox and reports selection through an event-style onChange", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled label="Fruit" options={FRUITS} onChangeSpy={spy} />);

    const input = screen.getByLabelText("Fruit");
    expect(input).toHaveAttribute("role", "combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");

    await user.click(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(options()).toHaveLength(4);

    await user.click(screen.getByRole("option", { name: /Banana/ }));
    expect(spy).toHaveBeenCalledWith("banana");
    expect(input).toHaveValue("Banana");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters options as the user types and matches descriptions too", async () => {
    const user = userEvent.setup();
    render(<Controlled label="Fruit" options={FRUITS} />);
    await user.click(combo());
    await user.type(combo(), "dri");
    expect(options()).toHaveLength(1);
    expect(options()[0]).toHaveTextContent("Date");
    expect(options()[0]).toHaveTextContent("Dried");
  });

  it("shows the empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Controlled label="Fruit" options={FRUITS} emptyText="Nothing like that" />);
    await user.click(combo());
    await user.type(combo(), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("Nothing like that");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation: arrows move, Enter selects, skipping disabled options", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled label="Fruit" options={FRUITS} onChangeSpy={spy} />);
    combo().focus();

    await user.keyboard("{ArrowDown}");
    expect(combo()).toHaveAttribute("aria-expanded", "true");
    const active = () => document.getElementById(combo().getAttribute("aria-activedescendant"));
    expect(active()).toHaveTextContent("Apple");

    await user.keyboard("{ArrowDown}");
    expect(active()).toHaveTextContent("Banana");
    // Cherry is disabled, so the next step lands on Date.
    await user.keyboard("{ArrowDown}");
    expect(active()).toHaveTextContent("Date");
    // Wrap around to the top.
    await user.keyboard("{ArrowDown}");
    expect(active()).toHaveTextContent("Apple");

    await user.keyboard("{ArrowUp}");
    expect(active()).toHaveTextContent("Date");
    await user.keyboard("{Enter}");
    expect(spy).toHaveBeenLastCalledWith("date");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("uses Home and End on non-searchable lists", async () => {
    const user = userEvent.setup();
    render(<Controlled label="Fruit" options={FRUITS} searchable={false} />);
    combo().focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{End}");
    expect(document.getElementById(combo().getAttribute("aria-activedescendant"))).toHaveTextContent("Date");
    await user.keyboard("{Home}");
    expect(document.getElementById(combo().getAttribute("aria-activedescendant"))).toHaveTextContent("Apple");
  });

  it("closes on Escape without letting the event reach an enclosing dialog", async () => {
    const user = userEvent.setup();
    const dialogKeydown = vi.fn();
    document.addEventListener("keydown", dialogKeydown);
    try {
      render(<Controlled label="Fruit" options={FRUITS} />);
      await user.click(combo());
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(dialogKeydown).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Escape" }));
    } finally {
      document.removeEventListener("keydown", dialogKeydown);
    }
  });

  it("does not submit an enclosing form when Enter selects an option", async () => {
    const user = userEvent.setup();
    const submit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <Controlled label="Fruit" options={FRUITS} />
      </form>,
    );
    combo().focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(submit).not.toHaveBeenCalled();
  });

  it("closes when the pointer moves outside and when Tab leaves the field", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Controlled label="Fruit" options={FRUITS} />
        <button type="button">Outside</button>
      </div>,
    );
    await user.click(combo());
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(combo());
    await user.tab();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports a selectable placeholder option so filters can be reset", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Controlled label="Status" options={FRUITS} placeholder="All fruit" initial="apple" onChangeSpy={spy} />);
    expect(combo()).toHaveValue("Apple");
    await user.click(combo());
    await user.click(screen.getByRole("option", { name: "All fruit" }));
    expect(spy).toHaveBeenCalledWith("");
    expect(combo()).toHaveValue("");
    expect(combo()).toHaveAttribute("placeholder", "All fruit");
  });

  it("accepts native <option> children as options (drop-in for the native select)", async () => {
    const user = userEvent.setup();
    render(
      <Controlled label="Plan" initial="">
        <option value="starter">Starter</option>
        <option value="pro">Professional</option>
      </Controlled>,
    );
    await user.click(combo());
    expect(options().map((o) => o.textContent)).toEqual(["Starter", "Professional"]);
  });

  describe("single select clear", () => {
    it("clears the selection with the clear button and returns an empty value", async () => {
      const user = userEvent.setup();
      const spy = vi.fn();
      render(<Controlled label="Fruit" options={FRUITS} initial="banana" clearable onChangeSpy={spy} />);
      await user.click(screen.getByRole("button", { name: "Clear selection" }));
      expect(spy).toHaveBeenLastCalledWith("");
      expect(combo()).toHaveValue("");
    });

    it("hides the clear button when nothing is selected or the field is disabled", () => {
      const { rerender } = render(<Controlled label="Fruit" options={FRUITS} clearable />);
      expect(screen.queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();
      rerender(<Controlled label="Fruit" options={FRUITS} clearable disabled initial="apple" />);
      expect(screen.queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();
    });
  });

  describe("multi select", () => {
    it("selects several options, shows chips, removes one and removes the last with Backspace", async () => {
      const user = userEvent.setup();
      const spy = vi.fn();
      render(<Controlled label="Skills" options={FRUITS} multiple initial={["apple"]} onChangeSpy={spy} />);
      expect(screen.getByText("Apple")).toBeInTheDocument();

      await user.click(combo());
      await user.click(screen.getByRole("option", { name: /Banana/ }));
      expect(spy).toHaveBeenLastCalledWith(["apple", "banana"]);
      // The list stays open for more picks.
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Remove Apple" }));
      expect(spy).toHaveBeenLastCalledWith(["banana"]);

      combo().focus();
      await user.keyboard("{Backspace}");
      expect(spy).toHaveBeenLastCalledWith([]);
    });

    it("writes one hidden input per value so a native form submits them all", () => {
      const { container } = render(
        <Controlled label="Skills" options={FRUITS} multiple name="skills" initial={["apple", "date"]} />,
      );
      const hidden = [...container.querySelectorAll('input[type="hidden"][name="skills"]')].map((i) => i.value);
      expect(hidden).toEqual(["apple", "date"]);
    });
  });

  describe("states", () => {
    it("shows a loading status instead of options while loading", async () => {
      const user = userEvent.setup();
      render(<Controlled label="Company" options={[]} loading loadingText="Fetching companies" />);
      await user.click(combo());
      expect(screen.getByRole("status")).toHaveTextContent("Fetching companies");
      expect(combo()).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("does not open when disabled", async () => {
      const user = userEvent.setup();
      render(<Controlled label="Fruit" options={FRUITS} disabled />);
      expect(combo()).toBeDisabled();
      await user.click(combo());
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("marks the field invalid and links the error message", () => {
      render(<Controlled label="Fruit" options={FRUITS} error="Choose a fruit" />);
      expect(combo()).toHaveAttribute("aria-invalid", "true");
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Choose a fruit");
      expect(combo().getAttribute("aria-describedby")).toContain(alert.id);
    });

    it("shows the hint when there is no error", () => {
      render(<Controlled label="Fruit" options={FRUITS} hint="Pick one" />);
      expect(screen.getByText("Pick one")).toBeInTheDocument();
      expect(combo()).toHaveAttribute("aria-invalid", "false");
    });
  });

  describe("validation wiring", () => {
    it("sets a native validity message only while a required field has no selection", () => {
      const { rerender } = render(<SearchableSelect label="Fruit" options={FRUITS} required value="" onChange={() => {}} />);
      expect(combo().validationMessage).toBe("Please select an option.");
      expect(combo()).toHaveAttribute("aria-required", "true");
      rerender(<SearchableSelect label="Fruit" options={FRUITS} required value="apple" onChange={() => {}} />);
      expect(combo().validationMessage).toBe("");
    });
  });

  it("keeps the value controlled by the parent", () => {
    const onChange = vi.fn();
    render(<SearchableSelect label="Fruit" options={FRUITS} value="cherry" onChange={onChange} />);
    expect(combo()).toHaveValue("Cherry");
    fireEvent.click(combo());
    expect(combo()).toHaveValue("Cherry");
  });
});

describe("normaliseOptions", () => {
  it("handles strings, objects and option children together", () => {
    expect(
      normaliseOptions(["a", { value: "b", label: "Bee" }], [<option key="c" value="c">Sea</option>]),
    ).toEqual([
      { value: "a", label: "a" },
      { value: "b", label: "Bee", description: "", disabled: false },
      { value: "c", label: "Sea", disabled: false },
    ]);
  });
});

describe("inside a native form (integration)", () => {
  it("submits the chosen value with the form and blocks submission while a required field is empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const Harness = () => {
      const [value, setValue] = useState("");
      const [submitted, setSubmitted] = useState(null);
      return (
        <form
          aria-label="Fruit form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
            setSubmitted(new FormData(e.currentTarget).get("fruit"));
          }}
        >
          <SearchableSelect
            label="Fruit"
            name="fruit"
            options={FRUITS}
            value={value}
            required
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit">Save</button>
          <output data-testid="out">{submitted ?? "none"}</output>
        </form>
      );
    };
    render(<Harness />);

    // Empty and required: native validation stops the submit.
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(combo());
    await user.click(screen.getByRole("option", { name: /Banana/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("out")).toHaveTextContent("banana");
  });
});
