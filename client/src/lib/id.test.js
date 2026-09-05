import { test, expect } from "vitest";
import { newId } from "./id";

test("newId returns unique non-empty strings", () => {
  const ids = Array.from({ length: 100 }, () => newId());
  expect(new Set(ids).size).toBe(100);
  for (const id of ids) expect(typeof id).toBe("string");
});

test("newId output is usable as an Idempotency-Key (server validates 8-120 safe chars)", () => {
  const ids = Array.from({ length: 50 }, () => newId());
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9._:-]{8,120}$/);
});
