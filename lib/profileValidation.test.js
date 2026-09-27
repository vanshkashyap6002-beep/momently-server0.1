const test = require("node:test");
const assert = require("node:assert/strict");
const { validateProfileInput } = require("./profileValidation");

function validProfile(overrides = {}) {
  return {
    fullName: "Chermo User",
    phone: "+91 98765 43210",
    dateOfBirth: "2000-02-29",
    relationshipStatus: "Single",
    aboutMe: "A little about me.",
    ...overrides,
  };
}

test("accepts a valid profile and normalizes optional empty fields", () => {
  const result = validateProfileInput(validProfile({ phone: "  ", aboutMe: "  " }));
  assert.equal(result.errors, null);
  assert.equal(result.profile.fullName, "Chermo User");
  assert.equal(result.profile.phone, null);
  assert.equal(result.profile.aboutMe, null);
});

test("rejects malformed and future dates of birth", () => {
  assert.ok(validateProfileInput(validProfile({ dateOfBirth: "2025-02-29" })).errors.dateOfBirth);
  assert.ok(validateProfileInput(validProfile({ dateOfBirth: "2999-01-01" })).errors.dateOfBirth);
});

test("rejects invalid phone, relationship status, and oversized about text", () => {
  const result = validateProfileInput(validProfile({
    phone: "call me maybe",
    relationshipStatus: "unknown",
    aboutMe: "x".repeat(501),
  }));
  assert.ok(result.errors.phone);
  assert.ok(result.errors.relationshipStatus);
  assert.ok(result.errors.aboutMe);
});

test("rejects invalid names and non-object request bodies", () => {
  assert.ok(validateProfileInput(validProfile({ fullName: "<script>" })).errors.fullName);
  assert.ok(validateProfileInput(null).errors.fullName);
});
