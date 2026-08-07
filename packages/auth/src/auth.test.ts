import { describe, expect, it } from "vitest";
import { assertRole, AuthorizationError } from "./roles";

describe("role enforcement", () => {
	it("allows members to view", () => expect(() => assertRole("member", "member")).not.toThrow());
	it("denies member administration", () =>
		expect(() => assertRole("member", "admin")).toThrow(AuthorizationError));
});
