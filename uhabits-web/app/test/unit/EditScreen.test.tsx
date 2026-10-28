import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { EditScreen } from "../../src/EditScreen";
import type { HabitsCore } from "../../src/core";
import { createFakeCore, fakeHabit, type FakeCore } from "./fake-core";

function renderEdit(core: FakeCore, id: number | null = null, numerical = false) {
  const onDone = vi.fn();
  const result = render(<EditScreen core={core as unknown as HabitsCore} id={id} numerical={numerical} onDone={onDone} />);
  return { ...result, onDone };
}
const inputs = (c: HTMLElement) => [...c.querySelectorAll(".field-input")] as (HTMLInputElement | HTMLTextAreaElement)[];
const field = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll(".field")].find((f) => f.querySelector(".field-label")!.textContent === label) as HTMLElement;
const type = (el: Element, value: string) => fireEvent.input(el, { target: { value } });
const save = () => fireEvent.click(screen.getByText("Save", { selector: ".outlined-button" }));
const lastSaved = (core: FakeCore) => core.saveHabit.mock.calls.at(-1)![0];

describe("EditScreen: create a yes-or-no habit", () => {
  it("has Android's fields, title and defaults", () => {
    const { container } = renderEdit(createFakeCore());
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Create habit");
    expect([...container.querySelectorAll(".field-label")].map((l) => l.textContent)).toEqual(["Name", "Color", "Question", "Frequency", "Notes", "Category"]);
    expect(inputs(container)[0].placeholder).toBe("e.g. Exercise");
    expect(inputs(container)[1].placeholder).toBe("e.g. Did you exercise today?");
    expect(field(container, "Frequency").textContent).toContain("Every day");
    expect((container.querySelector(".color-button") as HTMLElement).style.background).toMatch(/#00897B|rgb\(0, 137, 123\)/i);
    expect((container.querySelector(".topbar") as HTMLElement).style.background).toMatch(/#00897B|rgb\(0, 137, 123\)/i);
  });

  it("does not save without a name", () => {
    const core = createFakeCore();
    const { container, onDone } = renderEdit(core);
    expect(container.querySelector(".field-error")).toBeNull();
    type(inputs(container)[0], "   ");
    save();
    expect(core.saveHabit).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(field(container, "Name").querySelector(".field-error")!.textContent).toBe("Cannot be blank");
    expect(field(container, "Name").classList.contains("error")).toBe(true);
  });

  it("saves the trimmed form", () => {
    const core = createFakeCore();
    const { container, onDone } = renderEdit(core);
    type(inputs(container)[0], "  Read  ");
    type(inputs(container)[1], " Did you read? ");
    type(field(container, "Notes").querySelector("textarea")!, " 20 pages ");
    type(field(container, "Category").querySelector("input")!, " Mind ");
    save();
    expect(lastSaved(core)).toEqual({
      id: null, name: "Read", question: "Did you read?", description: "20 pages", colorIndex: 8, customColor: null,
      freqNum: 1, freqDen: 1, numerical: false, unit: "", targetValue: 0, targetType: 0, category: " Mind ",
    });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("limits the name to 50 characters, like Android", () => {
    const { container } = renderEdit(createFakeCore());
    expect((inputs(container)[0] as HTMLInputElement).maxLength).toBe(50);
  });

  it("Back leaves without saving", () => {
    const core = createFakeCore();
    const { onDone } = renderEdit(core);
    fireEvent.click(screen.getByLabelText("Back"));
    expect(onDone).toHaveBeenCalled();
    expect(core.saveHabit).not.toHaveBeenCalled();
  });

  it("picks a palette colour, which also colours the toolbar", () => {
    const core = createFakeCore();
    const { container } = renderEdit(core);
    fireEvent.click(screen.getByLabelText("Change color"));
    expect(container.querySelectorAll(".swatches .swatch")[8].classList.contains("selected")).toBe(true);
    fireEvent.click(container.querySelectorAll(".swatches .swatch")[11]);
    expect(container.querySelector(".color-picker")).toBeNull();
    expect((container.querySelector(".topbar") as HTMLElement).style.background).toMatch(/#1976D2|rgb\(25, 118, 210\)/i);
    type(inputs(container)[0], "x");
    save();
    expect(lastSaved(core)).toMatchObject({ colorIndex: 11, customColor: null });
  });

  it("picks a custom colour, and a palette colour clears it again", () => {
    const core = createFakeCore();
    const { container } = renderEdit(core);
    type(inputs(container)[0], "x");
    fireEvent.click(screen.getByLabelText("Change color"));
    fireEvent.change(container.querySelector(".color-picker input[type=color]")!, { target: { value: "#ff69b4" } });
    expect((container.querySelector(".color-button") as HTMLElement).style.background).toMatch(/#FF69B4|rgb\(255, 105, 180\)/i);
    save();
    expect(lastSaved(core)).toMatchObject({ customColor: "#FF69B4" });
    fireEvent.click(screen.getByLabelText("Change color"));
    expect(container.querySelector(".custom-swatch.selected")).not.toBeNull();
    fireEvent.click(container.querySelectorAll(".swatches .swatch")[2]);
    save();
    expect(lastSaved(core)).toMatchObject({ colorIndex: 2, customColor: null });
  });
});

describe("EditScreen: frequency dialog (FrequencyPickerDialog)", () => {
  const rows = (c: HTMLElement) => [...c.querySelectorAll(".frequency-row")] as HTMLElement[];
  const openDialog = (c: HTMLElement) => fireEvent.click(field(c, "Frequency").querySelector(".field-dropdown")!);
  const saveDialog = () => fireEvent.click(screen.getByText("Save", { selector: ".dialog-action" }));
  const checked = (c: HTMLElement) => rows(c).findIndex((r) => (r.querySelector(".radio") as HTMLInputElement).checked);
  const values = (c: HTMLElement) => [...c.querySelectorAll(".frequency-input")].map((i) => (i as HTMLInputElement).value);

  it("starts on 'Every day' with Android's default numbers", () => {
    const { container } = renderEdit(createFakeCore());
    openDialog(container);
    expect(checked(container)).toBe(0);
    expect(values(container)).toEqual(["3", "3", "10", "3", "14"]);
    expect(rows(container).map((r) => r.textContent)).toEqual(["Every day", "Everydays", "times per week", "times per month", "times indays"]);
  });

  it.each([
    [1, "everyXDays", ["5"], 1, 5, "Every 5 days"],
    [2, "perWeek", ["4"], 4, 7, "4 times per week"],
    [3, "perMonth", ["12"], 12, 30, "12 times per month"],
    [4, "perYDays", ["3", "10"], 3, 10, "3 times in 10 days"],
  ])("row %i (%s) with %j saves %i/%i", (index, _name, typed, num, den, text) => {
    const core = createFakeCore();
    const { container } = renderEdit(core);
    openDialog(container);
    const fields = rows(container)[index].querySelectorAll(".frequency-input");
    typed.forEach((t, i) => {
      fireEvent.focus(fields[i]);
      type(fields[i], t);
    });
    expect(checked(container)).toBe(index); // focusing a number picks its row
    saveDialog();
    expect(container.querySelector(".frequency-dialog")).toBeNull();
    expect(field(container, "Frequency").textContent).toContain(text);
    type(inputs(container)[0], "x");
    save();
    expect(lastSaved(core)).toMatchObject({ freqNum: num, freqDen: den });
  });

  it("keeps only digits", () => {
    const { container } = renderEdit(createFakeCore());
    openDialog(container);
    const input = rows(container)[1].querySelector(".frequency-input")!;
    type(input, "1a2.5");
    expect((input as HTMLInputElement).value).toBe("125");
  });

  it.each([
    ["more times than days", 4, ["8", "7"]],
    ["zero times", 4, ["0", "7"]],
    ["7 times per week", 2, ["7"]],
  ])("falls back to every day for %s", (_why, index, typed) => {
    const core = createFakeCore();
    const { container } = renderEdit(core);
    openDialog(container);
    const fields = rows(container)[index as number].querySelectorAll(".frequency-input");
    (typed as string[]).forEach((t, i) => {
      fireEvent.focus(fields[i]);
      type(fields[i], t);
    });
    saveDialog();
    expect(field(container, "Frequency").textContent).toContain("Every day");
  });

  it("an empty number keeps every day", () => {
    const { container } = renderEdit(createFakeCore());
    openDialog(container);
    const input = rows(container)[1].querySelector(".frequency-input")!;
    fireEvent.focus(input);
    type(input, "");
    saveDialog();
    expect(field(container, "Frequency").textContent).toContain("Every day");
  });

  it("the radio button alone picks a row", () => {
    const { container } = renderEdit(createFakeCore());
    openDialog(container);
    fireEvent.click(rows(container)[2].querySelector(".radio")!);
    saveDialog();
    expect(field(container, "Frequency").textContent).toContain("3 times per week");
  });

  it.each([
    [1, 1, 0, ["3", "3", "10", "3", "14"]],
    [1, 4, 1, ["4", "3", "10", "3", "14"]],
    [5, 7, 2, ["3", "5", "10", "3", "14"]],
    [8, 30, 3, ["3", "3", "8", "3", "14"]],
    [1, 31, 3, ["3", "3", "1", "3", "14"]],
    [2, 9, 4, ["3", "3", "10", "2", "9"]],
  ])("an existing %i/%i habit opens on row %i", (num, den, row, vals) => {
    const core = createFakeCore([fakeHabit({ id: 1, freqNum: num, freqDen: den })]);
    const { container } = renderEdit(core, 1);
    openDialog(container);
    expect(checked(container)).toBe(row);
    expect(values(container)).toEqual(vals);
  });

  it("closing outside changes nothing", () => {
    const { container } = renderEdit(createFakeCore());
    openDialog(container);
    fireEvent.click(rows(container)[2].querySelector(".radio")!);
    fireEvent.click(container.querySelector(".overlay")!);
    expect(container.querySelector(".frequency-dialog")).toBeNull();
    expect(field(container, "Frequency").textContent).toContain("Every day");
  });
});

describe("EditScreen: measurable habits", () => {
  it("has unit, target, frequency and target type fields", () => {
    const { container } = renderEdit(createFakeCore(), null, true);
    expect([...container.querySelectorAll(".field-label")].map((l) => l.textContent)).toEqual(["Name", "Color", "Question", "Unit", "Target", "Frequency", "Target Type", "Notes", "Category"]);
    expect(inputs(container)[0].placeholder).toBe("e.g. Run");
    expect(inputs(container)[1].placeholder).toBe("e.g. How many miles did you run today?");
    expect(field(container, "Target Type").textContent).toContain("At least");
    expect(field(container, "Frequency").textContent).toContain("Every day");
  });

  it("needs a target", () => {
    const core = createFakeCore();
    const { container } = renderEdit(core, null, true);
    type(inputs(container)[0], "Run");
    save();
    expect(core.saveHabit).not.toHaveBeenCalled();
    expect(field(container, "Target").querySelector(".field-error")).not.toBeNull();
    expect(field(container, "Name").querySelector(".field-error")).toBeNull();
    type(field(container, "Target").querySelector("input")!, "abc");
    save();
    expect(core.saveHabit).not.toHaveBeenCalled();
  });

  it("saves unit, decimal target (comma or point), weekly frequency and 'at most'", () => {
    const core = createFakeCore();
    const { container } = renderEdit(core, null, true);
    type(inputs(container)[0], "Run");
    type(field(container, "Unit").querySelector("input")!, " km ");
    type(field(container, "Target").querySelector("input")!, "2,5");
    fireEvent.click(field(container, "Frequency").querySelector(".field-dropdown")!);
    expect([...container.querySelectorAll(".list-dialog-item")].map((i) => i.textContent)).toEqual(["Every day", "Every week", "Every month"]);
    fireEvent.click(screen.getByText("Every week"));
    fireEvent.click(field(container, "Target Type").querySelector(".field-dropdown")!);
    fireEvent.click(screen.getByText("At most"));
    expect(field(container, "Target Type").textContent).toContain("At most");
    expect(field(container, "Frequency").textContent).toContain("Every week");
    save();
    expect(lastSaved(core)).toMatchObject({ numerical: true, unit: "km", targetValue: 2.5, freqNum: 1, freqDen: 7, targetType: 1 });
  });

  it("monthly measurable habits are stored as 1/30", () => {
    const core = createFakeCore();
    const { container } = renderEdit(core, null, true);
    type(inputs(container)[0], "Run");
    type(field(container, "Target").querySelector("input")!, "100");
    fireEvent.click(field(container, "Frequency").querySelector(".field-dropdown")!);
    fireEvent.click(screen.getByText("Every month"));
    save();
    expect(lastSaved(core)).toMatchObject({ freqNum: 1, freqDen: 30, targetValue: 100 });
  });

  it("list dialogs close outside without a change", () => {
    const { container } = renderEdit(createFakeCore(), null, true);
    fireEvent.click(field(container, "Target Type").querySelector(".field-dropdown")!);
    fireEvent.click(container.querySelector(".overlay")!);
    expect(container.querySelector(".list-dialog")).toBeNull();
    expect(field(container, "Target Type").textContent).toContain("At least");
  });
});

describe("EditScreen: editing an existing habit", () => {
  it("is pre-filled, and saving keeps its id", () => {
    const core = createFakeCore([fakeHabit({ id: 5, name: "Read", question: "Q?", description: "D", colorIndex: 3, freqNum: 3, freqDen: 7, category: "Mind" })]);
    const { container } = renderEdit(core, 5);
    expect(container.querySelector(".topbar-title")!.textContent).toBe("Edit habit");
    expect(inputs(container)[0].value).toBe("Read");
    expect(inputs(container)[1].value).toBe("Q?");
    expect(field(container, "Frequency").textContent).toContain("3 times per week");
    expect((field(container, "Category").querySelector("input") as HTMLInputElement).value).toBe("Mind");
    save();
    expect(lastSaved(core)).toMatchObject({ id: 5, name: "Read", colorIndex: 3, freqNum: 3, freqDen: 7, description: "D" });
  });

  it("shows a measurable habit's target and keeps a custom colour", () => {
    const core = createFakeCore([fakeHabit({ id: 6, name: "Run", numerical: true, unit: "km", targetValue: 7.5, targetType: 1, freqDen: 7, colorIndex: 15, customColor: "#ff69b4" })]);
    const { container } = renderEdit(core, 6);
    expect((field(container, "Target").querySelector("input") as HTMLInputElement).value).toBe("7.5");
    expect(field(container, "Target Type").textContent).toContain("At most");
    expect(field(container, "Frequency").textContent).toContain("Every week");
    expect((container.querySelector(".color-button") as HTMLElement).style.background).toMatch(/#ff69b4|rgb\(255, 105, 180\)/i);
    save();
    expect(lastSaved(core)).toMatchObject({ id: 6, targetValue: 7.5, targetType: 1, customColor: "#ff69b4" });
  });

  it("shows an odd measurable frequency as a fraction", () => {
    const core = createFakeCore([fakeHabit({ id: 7, numerical: true, targetValue: 1, freqNum: 1, freqDen: 3 })]);
    const { container } = renderEdit(core, 7);
    expect(field(container, "Frequency").textContent).toContain("1/3");
  });
});

describe("EditScreen: category suggestions", () => {
  it("shows matching existing categories while the field has focus", () => {
    const core = createFakeCore([fakeHabit({ category: "Mind" }), fakeHabit({ category: "Body" }), fakeHabit({ category: "Music" })]);
    const { container } = renderEdit(core);
    const input = field(container, "Category").querySelector("input")!;
    const chips = () => [...container.querySelectorAll(".field-chips .chip")].map((c) => c.textContent);
    expect(chips()).toEqual([]);
    fireEvent.focus(input);
    expect(chips()).toEqual(["Body", "Mind", "Music"]);
    type(input, "m");
    expect(chips()).toEqual(["Mind", "Music"]);
    fireEvent.click(screen.getByText("Music"));
    expect((input as HTMLInputElement).value).toBe("Music");
    expect(chips()).toEqual([]); // the chosen one is not suggested again
    fireEvent.blur(input);
    type(input, "");
    expect(chips()).toEqual([]);
  });

  it("chips keep the focus in the field (mousedown is cancelled)", () => {
    const core = createFakeCore([fakeHabit({ category: "Mind" })]);
    const { container } = renderEdit(core);
    fireEvent.focus(field(container, "Category").querySelector("input")!);
    const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    container.querySelector(".field-chips .chip")!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
