// @vitest-environment jsdom

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { App } from "../../src/app/App";

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("shared app flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(App));
      await flushWork();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushWork();
    });

    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("persists matrix drafts across tabs and captures matrix results in shared history", async () => {
    await clickButton("Matrix Lab");

    const [rowSelect, columnSelect] = getDimensionSelects();
    expect(rowSelect).toBeDefined();
    expect(columnSelect).toBeDefined();
    await changeSelect(rowSelect!, "3");
    await changeSelect(columnSelect!, "3");

    await clickButton("Expression Engine");
    await clickButton("Matrix Lab");
    expect(getMatrixCells()).toHaveLength(9);

    const persistedWorkspace = window.localStorage.getItem("calculator.workspace.v1");
    expect(persistedWorkspace).toContain('"rows":3');
    expect(persistedWorkspace).toContain('"columns":3');

    await changeSelect(getActionSelect(), "transpose");
    await clickButton("Run matrix task");
    await waitForText("Matrix Transpose");
    expect(container.textContent).toContain("[1, 0, 0] [0, 1, 0] [0, 0, 0]");

    await clickButton("Capture History Snapshot");
    const historyText = container.querySelector(".history-list")?.textContent ?? "";
    expect(historyText).toContain("Matrix Transpose");
    expect(historyText).toContain("[1, 0, 0] [0, 1, 0] [0, 0, 0]");
  });

  function getMatrixCells(): HTMLInputElement[] {
    return Array.from(container.querySelectorAll<HTMLInputElement>(".matrix-grid .matrix-cell"));
  }

  function getDimensionSelects(): HTMLSelectElement[] {
    return Array.from(container.querySelectorAll<HTMLSelectElement>(".matrix-dimension-controls select"));
  }

  function getActionSelect(): HTMLSelectElement {
    const select = container.querySelector<HTMLSelectElement>(".matrix-toolbar select");
    if (!select) {
      throw new Error("Matrix action select not found.");
    }

    return select;
  }
});

async function clickButton(label: string): Promise<void> {
  const button = findButton(label);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushWork();
  });
}

async function changeTextInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flushWork();
  });
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flushWork();
  });
}

async function waitForText(value: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (document.body.textContent?.includes(value)) {
      return;
    }

    await act(async () => {
      await flushWork();
    });
  }

  throw new Error(`Text not found: ${value}`);
}

async function flushWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    candidate.textContent?.includes(label)
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}
